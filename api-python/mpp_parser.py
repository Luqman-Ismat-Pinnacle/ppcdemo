import os
import traceback
import tempfile
import json
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import jpype
import mpxj

def init_jvm():
    if not jpype.isJVMStarted():
        try:
            # Added JVM memory limit as seen in your Dockerfile
            jpype.startJVM("-Xmx512m", convertStrings=True)
            print("JVM started successfully.")
        except Exception as e:
            print(f"JVM Startup Error: {e}")
            return False
    return True

app = Flask(__name__)
CORS(app)

class ProjectParser:
    def __init__(self):
        from org.mpxj.reader import UniversalProjectReader
        self.reader = UniversalProjectReader()

    def _to_iso(self, j_date):
        if not j_date: return None
        try:
            return str(j_date.toString())
        except:
            return None

    def _to_float(self, val):
        if val is None: return 0.0
        try:
            if hasattr(val, 'doubleValue'): return float(val.doubleValue())
            return float(val)
        except:
            return 0.0

    def parse_file(self, path):
        # 1. Read the file
        project = self.reader.read(path)
        
        # 2. Run the CPM Analyzer to calculate roll-up dates and Slack
        try:
            from org.mpxj.scheduling import CriticalPathMethodAnalyzer
            analyzer = CriticalPathMethodAnalyzer()
            analyzer.schedule(project)
        except:
            print("Scheduling analyzer not found or failed; continuing with raw data.")

        # 3. Project-wide properties
        props = project.getProjectProperties()
        project_info = {
            'name': str(props.getProjectTitle() or "Imported Project"),
            'startDate': self._to_iso(props.getStartDate()),
            'endDate': self._to_iso(props.getFinishDate()),
            'manager': str(props.getManager() or "")
        }

        # 4. Process all tasks in order
        all_tasks = []
        tasks = project.getTasks()
        
        for task in tasks:
            # We no longer skip empty names or Level 0 to preserve full hierarchy
            uid = str(task.getUniqueID())
            name = str(task.getName() or "")
            level = int(task.getOutlineLevel() or 0)
            
            # Determine hierarchy info
            is_summary = bool(task.getSummary())
            parent_task = task.getParentTask()
            parent_id = str(parent_task.getUniqueID()) if parent_task and parent_task.getUniqueID() else None

            # Resource extraction
            res_names = []
            assignments = task.getResourceAssignments()
            if assignments:
                for a in assignments:
                    r = a.getResource()
                    if r: res_names.append(str(r.getName() or ""))
            assigned_resource = ", ".join(filter(None, res_names))

            # Calculation logic for Remaining Hours
            total_work = self._to_float(task.getWork().getDuration()) if task.getWork() else 0.0
            actual_work = self._to_float(task.getActualWork().getDuration()) if task.getActualWork() else 0.0

            node = {
                'id': uid,
                'name': name,
                'outline_level': level,
                'is_summary': is_summary,
                'parent_id': parent_id,
                'startDate': self._to_iso(task.getStart()),
                'endDate': self._to_iso(task.getFinish()),
                'percentComplete': self._to_float(task.getPercentageComplete()),
                'baselineHours': self._to_float(task.getBaselineWork().getDuration()) if task.getBaselineWork() else 0.0,
                'actualHours': actual_work,
                'projectedHours': total_work,
                'remainingHours': max(0, total_work - actual_work),
                'assignedResource': assigned_resource,
                'isCritical': bool(task.getCritical()),
                'totalSlack': self._to_float(task.getTotalSlack().getDuration()) if task.getTotalSlack() else 0.0,
                'comments': str(task.getNotes() or "")
            }
            all_tasks.append(node)

        return {
            'success': True,
            'project': project_info,
            'tasks': all_tasks, # Returning a single source of truth list
            'summary': {
                'total_rows': len(all_tasks)
            }
        }

@app.route('/')
def ui():
    return render_template('index.html')

@app.route('/health')
def health(): return jsonify(status="ok", version="v13-cpm-ui")

@app.route('/parse', methods=['POST'])
def parse():
    f = request.files.get('file')
    if not f: return jsonify(success=False, error="No file uploaded"), 400
    if not init_jvm(): return jsonify(success=False, error="JVM Init Failed"), 500

    try:
        with tempfile.NamedTemporaryFile(suffix=".mpp", delete=False) as t:
            f.save(t.name)
            res = ProjectParser().parse_file(t.name)
        os.remove(t.name)
        return jsonify(res)
    except Exception as e:
        traceback.print_exc()
        return jsonify(success=False, error=str(e)), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)