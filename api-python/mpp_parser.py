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

    def _to_cost(self, val):
        """Extract numeric cost from MPXJ (Double or cost object). Returns 0.0 if missing."""
        if val is None: return 0.0
        try:
            if hasattr(val, 'doubleValue'): return float(val.doubleValue())
            if hasattr(val, 'getAmount'): return float(val.getAmount())
            return float(val)
        except:
            return 0.0

    def _normalize_relation_type(self, relation):
        try:
            rel_type_obj = relation.getType()
            rel_type = str(rel_type_obj) if rel_type_obj else 'FS'
        except Exception:
            rel_type = 'FS'

        rel_type_upper = rel_type.upper().replace('_', '')
        if 'FINISH_START' in rel_type.upper() or rel_type_upper == 'FS':
            return 'FS'
        if 'START_START' in rel_type.upper() or rel_type_upper == 'SS':
            return 'SS'
        if 'FINISH_FINISH' in rel_type.upper() or rel_type_upper == 'FF':
            return 'FF'
        if 'START_FINISH' in rel_type.upper() or rel_type_upper == 'SF':
            return 'SF'
        return 'FS'

    def _extract_relation_tasks(self, relation):
        predecessor_task = None
        successor_task = None

        # Modern MPXJ API (v13+)
        try:
            predecessor_task = relation.getPredecessorTask()
        except Exception:
            predecessor_task = None
        try:
            successor_task = relation.getSuccessorTask()
        except Exception:
            successor_task = None

        # Backward compatibility fallback
        if predecessor_task is None:
            try:
                predecessor_task = relation.getSourceTask()
            except Exception:
                predecessor_task = None
        if successor_task is None:
            try:
                successor_task = relation.getTargetTask()
            except Exception:
                successor_task = None

        return predecessor_task, successor_task

    def _task_id(self, task, fallback=''):
        try:
            uid = task.getUniqueID()
            if uid is not None:
                return str(uid)
        except Exception:
            pass
        try:
            tid = task.getID()
            if tid is not None:
                return f"task-{tid}"
        except Exception:
            pass
        try:
            outline = task.getOutlineNumber()
            if outline:
                return f"outline-{outline}"
        except Exception:
            pass
        return fallback

    def _collect_tasks(self, project):
        candidates = []

        # Strategy 1: MPXJ all tasks API
        try:
            all_tasks = project.getAllTasks()
            if all_tasks:
                for t in all_tasks:
                    if t is not None:
                        candidates.append(t)
        except Exception:
            pass

        # Strategy 2: direct project tasks API
        try:
            top_tasks = project.getTasks()
            if top_tasks:
                for t in top_tasks:
                    if t is not None:
                        candidates.append(t)
        except Exception:
            pass

        # Strategy 3: recurse child tasks from each top-level node.
        def add_descendants(task):
            try:
                children = task.getChildTasks()
            except Exception:
                children = None
            if not children:
                return
            for child in children:
                if child is None:
                    continue
                candidates.append(child)
                add_descendants(child)

        for task in list(candidates):
            add_descendants(task)

        # De-duplicate while preserving order.
        deduped = []
        seen = set()
        for idx, task in enumerate(candidates):
            stable_id = self._task_id(task, fallback=f"row-{idx + 1}")
            if stable_id in seen:
                continue
            seen.add(stable_id)
            deduped.append(task)

        return deduped

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
        tasks = self._collect_tasks(project)
        
        for idx, task in enumerate(tasks):
            # We no longer skip empty names or Level 0 to preserve full hierarchy
            uid = self._task_id(task, fallback=f"row-{idx + 1}")
            name = str(task.getName() or "")
            level = int(task.getOutlineLevel() or 0)
            hierarchy_type = 'project'
            if level == 2:
                hierarchy_type = 'unit'
            elif level == 3:
                hierarchy_type = 'phase'
            elif level >= 4:
                hierarchy_type = 'task'
            
            # Determine hierarchy info
            is_summary = bool(task.getSummary())
            parent_task = task.getParentTask()
            parent_id = self._task_id(parent_task, fallback='') if parent_task else None
            if not parent_id:
                parent_id = None

            # Resource extraction
            res_names = []
            assignments = task.getResourceAssignments()
            if assignments:
                for a in assignments:
                    r = a.getResource()
                    if r: res_names.append(str(r.getName() or ""))
            assigned_resource = ", ".join(filter(None, res_names))

            # Extract work values directly from MPP file - no calculation
            total_work = self._to_float(task.getWork().getDuration()) if task.getWork() else 0.0
            actual_work = self._to_float(task.getActualWork().getDuration()) if task.getActualWork() else 0.0
            remaining_work = self._to_float(task.getRemainingWork().getDuration()) if task.getRemainingWork() else None
            baseline_work = self._to_float(task.getBaselineWork().getDuration()) if task.getBaselineWork() else 0.0

            # Extract cost values directly from MPP file (baseline cost, actual cost, remaining cost)
            baseline_cost = 0.0
            actual_cost = 0.0
            remaining_cost = None
            try:
                bc = task.getBaselineCost()
                if bc is not None:
                    baseline_cost = self._to_cost(bc)
                ac = task.getActualCost()
                if ac is not None:
                    actual_cost = self._to_cost(ac)
                rc = task.getRemainingCost()
                if rc is not None:
                    remaining_cost = self._to_cost(rc)
            except Exception:
                pass  # MPXJ may not expose cost in some versions or file types

            # Extract predecessor relationships using MPXJ Relation objects.
            predecessors = []
            try:
                pred_relations = task.getPredecessors()
                if pred_relations:
                    for relation in pred_relations:
                        try:
                            predecessor_task, _ = self._extract_relation_tasks(relation)
                            predecessor_id = self._task_id(predecessor_task, fallback='')
                            if not predecessor_task or not predecessor_id:
                                continue

                            rel_type_normalized = self._normalize_relation_type(relation)

                            lag_duration = relation.getLag()
                            lag_days = 0.0
                            if lag_duration:
                                try:
                                    lag_days = self._to_float(lag_duration.getDuration())
                                except:
                                    lag_days = 0.0

                            predecessors.append({
                                'predecessorTaskId': predecessor_id,
                                'predecessorName': str(predecessor_task.getName() or ''),
                                'relationship': rel_type_normalized,
                                'lagDays': lag_days,
                                'isExternal': bool(predecessor_task.getExternalTask())
                            })
                        except Exception as rel_err:
                            print(f"  Warning: Could not parse relation for task {uid}: {rel_err}")
            except Exception as pred_err:
                print(f"  Warning: getPredecessors() failed for task {uid}: {pred_err}")

            # Extract successors explicitly as well.
            successors = []
            try:
                succ_relations = task.getSuccessors()
                if succ_relations:
                    for relation in succ_relations:
                        try:
                            _, successor_task = self._extract_relation_tasks(relation)
                            successor_id = self._task_id(successor_task, fallback='')
                            if not successor_task or not successor_id:
                                continue

                            rel_type_normalized = self._normalize_relation_type(relation)

                            lag_duration = relation.getLag()
                            lag_days = 0.0
                            if lag_duration:
                                try:
                                    lag_days = self._to_float(lag_duration.getDuration())
                                except:
                                    lag_days = 0.0

                            successors.append({
                                'successorTaskId': successor_id,
                                'successorName': str(successor_task.getName() or ''),
                                'relationship': rel_type_normalized,
                                'lagDays': lag_days,
                                'isExternal': bool(successor_task.getExternalTask())
                            })
                        except Exception as rel_err:
                            print(f"  Warning: Could not parse successor relation for task {uid}: {rel_err}")
            except Exception as succ_err:
                print(f"  Warning: getSuccessors() failed for task {uid}: {succ_err}")

            node = {
                'id': uid,
                'name': name,
                'outline_level': level,
                'hierarchy_type': hierarchy_type,
                'is_summary': is_summary,
                'parent_id': parent_id,
                'startDate': self._to_iso(task.getStart()),
                'endDate': self._to_iso(task.getFinish()),
                'percentComplete': self._to_float(task.getPercentageComplete()),
                'baselineHours': baseline_work,
                'actualHours': actual_work,
                'projectedHours': total_work,
                'remainingHours': remaining_work,  # Direct from MPP file, not calculated
                'baselineCost': baseline_cost,
                'actualCost': actual_cost,
                'remainingCost': remaining_cost,  # Direct from MPP file
                'assignedResource': assigned_resource,
                'isCritical': bool(task.getCritical()),
                'totalSlack': self._to_float(task.getTotalSlack().getDuration()) if task.getTotalSlack() else 0.0,
                'comments': str(task.getNotes() or ""),
                'predecessors': predecessors,
                'successors': successors
            }
            all_tasks.append(node)

        total_pred_links = sum(len(t.get('predecessors') or []) for t in all_tasks)
        total_succ_links = sum(len(t.get('successors') or []) for t in all_tasks)
        unit_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'unit')
        phase_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'phase')
        task_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'task')
        tasks_with_predecessors = sum(1 for t in all_tasks if (t.get('predecessors') or []))
        tasks_with_successors = sum(1 for t in all_tasks if (t.get('successors') or []))
        leaf_tasks = [t for t in all_tasks if not bool(t.get('is_summary'))]
        linked_leaf_tasks = [
            t for t in leaf_tasks
            if (t.get('predecessors') or []) or (t.get('successors') or [])
        ]
        isolated_leaf_tasks = len(leaf_tasks) - len(linked_leaf_tasks)
        coverage_percent = 0.0
        if len(leaf_tasks) > 0:
            coverage_percent = round((len(linked_leaf_tasks) / len(leaf_tasks)) * 100.0, 2)

        return {
            'success': True,
            'project': project_info,
            'tasks': all_tasks, # Returning a single source of truth list
            'summary': {
                'total_rows': len(all_tasks),
                'units': unit_count,
                'phases': phase_count,
                'tasks': task_count,
                'dependencies': {
                    'totalPredecessorLinks': total_pred_links,
                    'totalSuccessorLinks': total_succ_links,
                    'tasksWithPredecessors': tasks_with_predecessors,
                    'tasksWithSuccessors': tasks_with_successors,
                    'totalLeafTasks': len(leaf_tasks),
                    'linkedLeafTasks': len(linked_leaf_tasks),
                    'isolatedLeafTasks': isolated_leaf_tasks,
                    'coveragePercent': coverage_percent,
                },
                'taskCollection': {
                    'collectedTaskCount': len(tasks),
                    'parsedTaskCount': len(all_tasks),
                },
            }
        }

@app.route('/')
def ui():
    return render_template('index.html')

@app.route('/health')
def health(): return jsonify(status="ok", version="v17-dependency-coverage")

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
