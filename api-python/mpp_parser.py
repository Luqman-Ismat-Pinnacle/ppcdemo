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

    def _to_duration_hours(self, duration, default_hours_per_day=8.0):
        """Convert MPXJ Duration to hours. Uses getDuration() value; assumes hours if from Work, days if from task duration."""
        if duration is None:
            return None
        try:
            if hasattr(duration, 'getDuration'):
                val = duration.getDuration()
                if val is None:
                    return None
                hours = self._to_float(val)
                if hasattr(duration, 'getUnits'):
                    units = duration.getUnits()
                    if units:
                        u = str(units).upper()
                        if 'DAY' in u or 'D' == u:
                            hours = hours * default_hours_per_day
                        elif 'WEEK' in u or 'W' == u:
                            hours = hours * default_hours_per_day * 5
                return hours
            return self._to_float(duration)
        except Exception:
            return None

    def _constraint_type_to_string(self, ct):
        """Convert MPXJ ConstraintType enum to string."""
        if ct is None:
            return None
        try:
            s = str(ct)
            for prefix in ['AS_SOON_AS_POSSIBLE', 'ASAP', 'ALAP', 'MUST_START_ON', 'MUST_FINISH_ON',
                          'START_NO_EARLIER_THAN', 'START_NO_LATER_THAN', 'FINISH_NO_EARLIER_THAN', 'FINISH_NO_LATER_THAN']:
                if prefix in s.upper():
                    return s.replace('_', ' ').lower() if '_' in s else s.lower()
            return s
        except Exception:
            return None

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

        # 3. Project-wide properties (extend project_info, do not replace existing fields)
        props = project.getProjectProperties()
        project_info = {
            'name': str(props.getProjectTitle() or "Imported Project"),
            'startDate': self._to_iso(props.getStartDate()),
            'endDate': self._to_iso(props.getFinishDate()),
            'manager': str(props.getManager() or ""),
        }
        try:
            sd = project.getStatusDate()
            if sd is not None:
                project_info['statusDate'] = self._to_iso(sd)
        except Exception:
            pass
        try:
            curr = project.getCurrency()
            if curr is not None:
                project_info['currency'] = str(curr)
        except Exception:
            pass
        try:
            dc = project.getDefaultCalendar()
            if dc is not None and hasattr(dc, 'getName'):
                project_info['defaultCalendar'] = str(dc.getName() or "")
            elif dc is not None:
                project_info['defaultCalendar'] = str(dc)
        except Exception:
            pass
        try:
            author = props.getAuthor()
            if author is not None:
                project_info['author'] = str(author)
        except Exception:
            pass
        try:
            company = props.getCompany()
            if company is not None:
                project_info['company'] = str(company)
        except Exception:
            pass
        try:
            keywords = props.getKeywords()
            if keywords is not None:
                project_info['keywords'] = str(keywords)
        except Exception:
            pass

        # 4. Process all tasks in order
        all_tasks = []
        tasks = self._collect_tasks(project)
        
        for idx, task in enumerate(tasks):
            # We no longer skip empty names or Level 0 to preserve full hierarchy
            uid = self._task_id(task, fallback=f"row-{idx + 1}")
            name = str(task.getName() or "")
            level = int(task.getOutlineLevel() or 0)
            
            # Determine hierarchy info
            is_summary = bool(task.getSummary())
            parent_task = task.getParentTask()
            parent_id = self._task_id(parent_task, fallback='') if parent_task else None
            if not parent_id:
                parent_id = None

            # Resource extraction (preserve assigned_resource for backward compatibility)
            res_names = []
            resource_assignments = []
            assignments = task.getResourceAssignments()
            if assignments:
                for a in assignments:
                    r = a.getResource()
                    if r:
                        res_names.append(str(r.getName() or ""))
                        try:
                            ra = {
                                'resourceName': str(r.getName() or ""),
                                'resourceId': str(r.getUniqueID()) if r.getUniqueID() is not None else str(r.getID()) if r.getID() is not None else "",
                            }
                            if a.getUnits() is not None:
                                ra['units'] = self._to_float(a.getUnits())
                            if a.getWork() and a.getWork().getDuration() is not None:
                                ra['work'] = self._to_float(a.getWork().getDuration())
                            if a.getActualWork() and a.getActualWork().getDuration() is not None:
                                ra['actualWork'] = self._to_float(a.getActualWork().getDuration())
                            if a.getRemainingWork() and a.getRemainingWork().getDuration() is not None:
                                ra['remainingWork'] = self._to_float(a.getRemainingWork().getDuration())
                            if a.getCost() is not None:
                                ra['cost'] = self._to_cost(a.getCost())
                            if a.getActualCost() is not None:
                                ra['actualCost'] = self._to_cost(a.getActualCost())
                            if a.getRemainingCost() is not None:
                                ra['remainingCost'] = self._to_cost(a.getRemainingCost())
                            if a.getStart() is not None:
                                ra['start'] = self._to_iso(a.getStart())
                            if a.getFinish() is not None:
                                ra['finish'] = self._to_iso(a.getFinish())
                            resource_assignments.append(ra)
                        except Exception as ra_err:
                            print(f"  Warning: Could not parse resource assignment for task {uid}: {ra_err}")
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

            # New fields (append only; preserve all existing fields above)
            wbs_code = None
            outline_number = None
            constraint_type = None
            constraint_date = None
            baseline_start_date = None
            baseline_end_date = None
            actual_start_date = None
            actual_end_date = None
            duration_hours = None
            baseline_duration = None
            actual_duration = None
            remaining_duration = None
            early_start = None
            early_finish = None
            late_start = None
            late_finish = None
            free_slack = None
            cost = None
            fixed_cost = None
            cost_variance = None
            work_variance = None
            duration_variance = None
            is_milestone = False
            is_estimated = False
            is_recurring = False
            is_external = False
            priority = None
            deadline = None
            calendar_name = None
            calendar_unique_id = None
            percent_work_complete = None
            physical_percent_complete = None
            contact = None
            task_manager = None
            hyperlink_address = None
            hyperlink_sub_address = None
            subproject_file = None
            subproject_task_id = None

            try:
                wbs = task.getWBS()
                if wbs is not None:
                    wbs_code = str(wbs)
            except Exception:
                pass
            try:
                on = task.getOutlineNumber()
                if on is not None:
                    outline_number = str(on)
            except Exception:
                pass
            try:
                ct = task.getConstraintType()
                if ct is not None:
                    constraint_type = self._constraint_type_to_string(ct)
            except Exception:
                pass
            try:
                cd = task.getConstraintDate()
                if cd is not None:
                    constraint_date = self._to_iso(cd)
            except Exception:
                pass
            try:
                baseline_start_date = self._to_iso(task.getBaselineStart())
            except Exception:
                pass
            try:
                baseline_end_date = self._to_iso(task.getBaselineFinish())
            except Exception:
                pass
            try:
                actual_start_date = self._to_iso(task.getActualStart())
            except Exception:
                pass
            try:
                actual_end_date = self._to_iso(task.getActualFinish())
            except Exception:
                pass
            try:
                d = task.getDuration()
                if d is not None:
                    duration_hours = self._to_duration_hours(d)
            except Exception:
                pass
            try:
                bd = task.getBaselineDuration()
                if bd is not None:
                    baseline_duration = self._to_duration_hours(bd)
            except Exception:
                pass
            try:
                ad = task.getActualDuration()
                if ad is not None:
                    actual_duration = self._to_duration_hours(ad)
            except Exception:
                pass
            try:
                rd = task.getRemainingDuration()
                if rd is not None:
                    remaining_duration = self._to_duration_hours(rd)
            except Exception:
                pass
            try:
                early_start = self._to_iso(task.getEarlyStart())
            except Exception:
                pass
            try:
                early_finish = self._to_iso(task.getEarlyFinish())
            except Exception:
                pass
            try:
                late_start = self._to_iso(task.getLateStart())
            except Exception:
                pass
            try:
                late_finish = self._to_iso(task.getLateFinish())
            except Exception:
                pass
            try:
                fs = task.getFreeSlack()
                if fs is not None and hasattr(fs, 'getDuration'):
                    free_slack = self._to_float(fs.getDuration())
                elif fs is not None:
                    free_slack = self._to_float(fs)
            except Exception:
                pass
            try:
                c = task.getCost()
                if c is not None:
                    cost = self._to_cost(c)
            except Exception:
                pass
            try:
                fc = task.getFixedCost()
                if fc is not None:
                    fixed_cost = self._to_cost(fc)
            except Exception:
                pass
            try:
                cv = task.getCostVariance()
                if cv is not None:
                    cost_variance = self._to_cost(cv)
            except Exception:
                pass
            try:
                wv = task.getWorkVariance()
                if wv is not None and hasattr(wv, 'getDuration'):
                    work_variance = self._to_float(wv.getDuration())
                elif wv is not None:
                    work_variance = self._to_float(wv)
            except Exception:
                pass
            try:
                dv = task.getDurationVariance()
                if dv is not None and hasattr(dv, 'getDuration'):
                    duration_variance = self._to_float(dv.getDuration())
                elif dv is not None:
                    duration_variance = self._to_float(dv)
            except Exception:
                pass
            try:
                is_milestone = bool(task.getMilestone())
            except Exception:
                pass
            try:
                is_estimated = bool(task.getEstimated())
            except Exception:
                pass
            try:
                is_recurring = bool(task.getRecurring())
            except Exception:
                pass
            try:
                is_external = bool(task.getExternalTask())
            except Exception:
                pass
            try:
                p = task.getPriority()
                if p is not None:
                    priority = str(p) if not isinstance(p, (int, float)) else int(p)
            except Exception:
                pass
            try:
                deadline = self._to_iso(task.getDeadline())
            except Exception:
                pass
            try:
                cal = task.getCalendar()
                if cal is not None and hasattr(cal, 'getName'):
                    calendar_name = str(cal.getName() or "")
                elif cal is not None:
                    calendar_name = str(cal)
            except Exception:
                pass
            try:
                cuid = task.getCalendarUniqueID()
                if cuid is not None:
                    calendar_unique_id = int(cuid)
            except Exception:
                pass
            try:
                pwc = task.getPercentageWorkComplete()
                if pwc is not None:
                    percent_work_complete = self._to_float(pwc)
            except Exception:
                pass
            try:
                ppc = task.getPhysicalPercentComplete()
                if ppc is not None:
                    physical_percent_complete = self._to_float(ppc)
            except Exception:
                pass
            try:
                cont = task.getContact()
                if cont is not None:
                    contact = str(cont)
            except Exception:
                pass
            try:
                tm = task.getManager()
                if tm is not None:
                    task_manager = str(tm)
            except Exception:
                pass
            try:
                ha = task.getHyperlinkAddress()
                if ha is not None:
                    hyperlink_address = str(ha)
            except Exception:
                pass
            try:
                hsa = task.getHyperlinkSubAddress()
                if hsa is not None:
                    hyperlink_sub_address = str(hsa)
            except Exception:
                pass
            try:
                spf = task.getSubprojectFile()
                if spf is not None:
                    subproject_file = str(spf)
            except Exception:
                pass
            try:
                spt = task.getSubprojectTaskID()
                if spt is not None:
                    subproject_task_id = int(spt)
            except Exception:
                pass

            node = {
                'id': uid,
                'name': name,
                'outline_level': level,
                'hierarchy_type': 'project',
                'is_summary': is_summary,
                'parent_id': parent_id,
                'startDate': self._to_iso(task.getStart()),
                'endDate': self._to_iso(task.getFinish()),
                'percentComplete': self._to_float(task.getPercentageComplete()),
                'baselineHours': baseline_work,
                'actualHours': actual_work,
                'projectedHours': total_work,
                'remainingHours': remaining_work,
                'baselineCost': baseline_cost,
                'actualCost': actual_cost,
                'remainingCost': remaining_cost,
                'assignedResource': assigned_resource,
                'isCritical': bool(task.getCritical()),
                'totalSlack': self._to_float(task.getTotalSlack().getDuration()) if task.getTotalSlack() else 0.0,
                'comments': str(task.getNotes() or ""),
                'predecessors': predecessors,
                'successors': successors,
                'wbsCode': wbs_code,
                'outlineNumber': outline_number,
                'constraintType': constraint_type,
                'constraintDate': constraint_date,
                'baselineStartDate': baseline_start_date,
                'baselineEndDate': baseline_end_date,
                'actualStartDate': actual_start_date,
                'actualEndDate': actual_end_date,
                'duration': duration_hours,
                'baselineDuration': baseline_duration,
                'actualDuration': actual_duration,
                'remainingDuration': remaining_duration,
                'earlyStart': early_start,
                'earlyFinish': early_finish,
                'lateStart': late_start,
                'lateFinish': late_finish,
                'freeSlack': free_slack,
                'cost': cost,
                'fixedCost': fixed_cost,
                'costVariance': cost_variance,
                'workVariance': work_variance,
                'durationVariance': duration_variance,
                'isMilestone': is_milestone,
                'isEstimated': is_estimated,
                'isRecurring': is_recurring,
                'isExternal': is_external,
                'priority': priority,
                'deadline': deadline,
                'calendarName': calendar_name,
                'calendarUniqueId': calendar_unique_id,
                'percentWorkComplete': percent_work_complete,
                'physicalPercentComplete': physical_percent_complete,
                'contact': contact,
                'manager': task_manager,
                'hyperlinkAddress': hyperlink_address,
                'hyperlinkSubAddress': hyperlink_sub_address,
                'subprojectFile': subproject_file,
                'subprojectTaskId': subproject_task_id,
                'resourceAssignments': resource_assignments,
            }
            all_tasks.append(node)

        # Dynamic hierarchy typing (top-down):
        # top/root -> project, then unit, then phase, then task, and deepest level
        # becomes sub_task when depth allows.
        outline_levels = [int(t.get('outline_level') or 0) for t in all_tasks]
        max_outline = max(outline_levels) if outline_levels else 0
        min_outline = min(outline_levels) if outline_levels else 0
        # Hierarchy anchor:
        # level 1 = project plan/root, mapping always starts at level 2
        # level 2 = unit, level 3 = phase, level 4+ = task, deepest may be sub_task.
        hierarchy_anchor = 2

        for node in all_tasks:
            level = int(node.get('outline_level') or 0)
            if level <= 1:
                node['hierarchy_type'] = 'project'
            elif level == hierarchy_anchor:
                node['hierarchy_type'] = 'unit'
            elif level == hierarchy_anchor + 1:
                node['hierarchy_type'] = 'phase'
            elif max_outline >= (hierarchy_anchor + 3) and level == max_outline:
                node['hierarchy_type'] = 'sub_task'
            else:
                node['hierarchy_type'] = 'task'

        # Ensure top root level remains project summary where available.
        for node in all_tasks:
            if int(node.get('outline_level') or 0) <= 1 and (node.get('is_summary') or node.get('parent_id') is None):
                node['hierarchy_type'] = 'project'

        # Add "folder" path based on parent chain for easier downstream conversion/debugging.
        by_id = {str(t.get('id')): t for t in all_tasks}
        folder_cache = {}

        def build_folder(task_id):
            task_id = str(task_id or '')
            if not task_id:
                return ''
            if task_id in folder_cache:
                return folder_cache[task_id]

            task_node = by_id.get(task_id)
            if not task_node:
                folder_cache[task_id] = ''
                return ''

            parent_id = task_node.get('parent_id')
            if not parent_id:
                folder_cache[task_id] = ''
                return ''

            parent_node = by_id.get(str(parent_id))
            if not parent_node:
                folder_cache[task_id] = ''
                return ''

            parent_folder = build_folder(str(parent_id))
            parent_name = str(parent_node.get('name') or str(parent_id)).strip()
            if parent_folder:
                folder_cache[task_id] = f"{parent_folder} / {parent_name}"
            else:
                folder_cache[task_id] = parent_name
            return folder_cache[task_id]

        for node in all_tasks:
            node['folder'] = build_folder(str(node.get('id') or ''))

        total_pred_links = sum(len(t.get('predecessors') or []) for t in all_tasks)
        total_succ_links = sum(len(t.get('successors') or []) for t in all_tasks)
        project_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'project')
        unit_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'unit')
        phase_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'phase')
        task_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'task')
        sub_task_count = sum(1 for t in all_tasks if t.get('hierarchy_type') == 'sub_task')
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
                'min_outline_level': min_outline,
                'max_outline_level': max_outline,
                'projects': project_count,
                'units': unit_count,
                'phases': phase_count,
                'tasks': task_count,
                'sub_tasks': sub_task_count,
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
def health(): return jsonify(status="ok", version="v18-full-mpxj-extraction")

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
