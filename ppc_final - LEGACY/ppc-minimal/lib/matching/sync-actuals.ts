import { execute } from '@/lib/db';

export async function syncMappedActualsToTasks(projectId?: string): Promise<void> {
  const where = projectId ? 'AND h.project_id = $1' : '';
  const params: unknown[] = projectId ? [projectId] : [];

  // 0) Direct sub-task-name matches
  await execute(
    `WITH buckets AS (
       SELECT h.project_id,
              LOWER(TRIM(h.mpp_phase_task)) AS key_name,
              SUM(COALESCE(h.hours, 0)) AS sum_hours,
              SUM(COALESCE(h.actual_cost, 0)) AS sum_cost
       FROM hour_entries h
       WHERE COALESCE(TRIM(h.mpp_phase_task), '') <> ''
         ${where}
       GROUP BY h.project_id, LOWER(TRIM(h.mpp_phase_task))
     ),
     st_hits AS (
       SELECT st.id AS sub_task_id, b.sum_hours, b.sum_cost
       FROM buckets b
       JOIN sub_tasks st
         ON st.project_id = b.project_id
        AND LOWER(TRIM(st.name)) = b.key_name
     ),
     agg AS (
       SELECT sub_task_id, SUM(sum_hours) AS ah, SUM(sum_cost) AS ac
       FROM st_hits
       GROUP BY sub_task_id
     )
     UPDATE sub_tasks st
        SET actual_hours = COALESCE(a.ah, 0),
            actual_cost = COALESCE(a.ac, 0),
            total_hours = COALESCE(a.ah, 0) + COALESCE(st.remaining_hours, 0),
            scheduled_cost = COALESCE(a.ac, 0) + COALESCE(st.remaining_cost, 0),
            updated_at = NOW()
       FROM agg a
      WHERE st.id = a.sub_task_id`,
    params,
  );

  // 1) Direct task-name matches
  await execute(
    `WITH buckets AS (
       SELECT h.project_id,
              LOWER(TRIM(h.mpp_phase_task)) AS key_name,
              SUM(COALESCE(h.hours, 0)) AS sum_hours,
              SUM(COALESCE(h.actual_cost, 0)) AS sum_cost
       FROM hour_entries h
       WHERE COALESCE(TRIM(h.mpp_phase_task), '') <> ''
         ${where}
       GROUP BY h.project_id, LOWER(TRIM(h.mpp_phase_task))
     ),
     task_hits AS (
       SELECT t.id AS task_id, b.sum_hours, b.sum_cost
       FROM buckets b
       JOIN tasks t
         ON t.project_id = b.project_id
        AND LOWER(TRIM(t.name)) = b.key_name
     ),
     agg AS (
       SELECT task_id, SUM(sum_hours) AS ah, SUM(sum_cost) AS ac
       FROM task_hits
       GROUP BY task_id
     )
     UPDATE tasks t
        SET actual_hours = COALESCE(a.ah, 0),
            actual_cost = COALESCE(a.ac, 0),
            total_hours = COALESCE(a.ah, 0) + COALESCE(t.remaining_hours, 0),
            scheduled_cost = COALESCE(a.ac, 0) + COALESCE(t.remaining_cost, 0),
            updated_at = NOW()
       FROM agg a
      WHERE t.id = a.task_id`,
    params,
  );

  // 2) Phase-name matches (for keys not already a task name)
  await execute(
    `WITH buckets AS (
       SELECT h.project_id,
              LOWER(TRIM(h.mpp_phase_task)) AS key_name,
              SUM(COALESCE(h.hours, 0)) AS sum_hours,
              SUM(COALESCE(h.actual_cost, 0)) AS sum_cost
       FROM hour_entries h
       WHERE COALESCE(TRIM(h.mpp_phase_task), '') <> ''
         ${where}
       GROUP BY h.project_id, LOWER(TRIM(h.mpp_phase_task))
     ),
     direct_task_keys AS (
       SELECT DISTINCT b.project_id, b.key_name
       FROM buckets b
       JOIN tasks t
         ON t.project_id = b.project_id
        AND LOWER(TRIM(t.name)) = b.key_name
     ),
     phase_buckets AS (
       SELECT b.*
       FROM buckets b
       LEFT JOIN direct_task_keys d
         ON d.project_id = b.project_id
        AND d.key_name = b.key_name
       WHERE d.key_name IS NULL
     ),
     phase_match AS (
       SELECT p.id AS phase_id, p.project_id, pb.sum_hours, pb.sum_cost
       FROM phase_buckets pb
       JOIN phases p
         ON p.project_id = pb.project_id
        AND LOWER(TRIM(p.name)) = pb.key_name
     ),
     task_weights AS (
       SELECT t.id AS task_id,
              pm.phase_id,
              pm.sum_hours,
              pm.sum_cost,
              COALESCE(NULLIF(t.baseline_hours, 0), NULLIF(t.total_hours, 0), 1) AS weight
       FROM phase_match pm
       JOIN tasks t ON t.phase_id = pm.phase_id
     ),
     phase_totals AS (
       SELECT phase_id, SUM(weight) AS total_weight
       FROM task_weights
       GROUP BY phase_id
     ),
     alloc AS (
       SELECT task_id,
              SUM(tw.sum_hours * (tw.weight / NULLIF(pt.total_weight, 0))) AS ah,
              SUM(tw.sum_cost * (tw.weight / NULLIF(pt.total_weight, 0))) AS ac
       FROM task_weights tw
       JOIN phase_totals pt ON pt.phase_id = tw.phase_id
       GROUP BY task_id
     )
     UPDATE tasks t
        SET actual_hours = COALESCE(t.actual_hours, 0) + COALESCE(a.ah, 0),
            actual_cost = COALESCE(t.actual_cost, 0) + COALESCE(a.ac, 0),
            total_hours = COALESCE(t.actual_hours, 0) + COALESCE(a.ah, 0) + COALESCE(t.remaining_hours, 0),
            scheduled_cost = COALESCE(t.actual_cost, 0) + COALESCE(a.ac, 0) + COALESCE(t.remaining_cost, 0),
            updated_at = NOW()
       FROM alloc a
      WHERE t.id = a.task_id`,
    params,
  );

  // 3) Unit-name matches (for keys not already task/phase names)
  await execute(
    `WITH buckets AS (
       SELECT h.project_id,
              LOWER(TRIM(h.mpp_phase_task)) AS key_name,
              SUM(COALESCE(h.hours, 0)) AS sum_hours,
              SUM(COALESCE(h.actual_cost, 0)) AS sum_cost
       FROM hour_entries h
       WHERE COALESCE(TRIM(h.mpp_phase_task), '') <> ''
         ${where}
       GROUP BY h.project_id, LOWER(TRIM(h.mpp_phase_task))
     ),
     taken_keys AS (
       SELECT DISTINCT b.project_id, b.key_name
       FROM buckets b
       JOIN tasks t
         ON t.project_id = b.project_id
        AND LOWER(TRIM(t.name)) = b.key_name
       UNION
       SELECT DISTINCT b.project_id, b.key_name
       FROM buckets b
       JOIN phases p
         ON p.project_id = b.project_id
        AND LOWER(TRIM(p.name)) = b.key_name
     ),
     unit_buckets AS (
       SELECT b.*
       FROM buckets b
       LEFT JOIN taken_keys k
         ON k.project_id = b.project_id
        AND k.key_name = b.key_name
       WHERE k.key_name IS NULL
     ),
     unit_match AS (
       SELECT u.id AS unit_id, u.project_id, ub.sum_hours, ub.sum_cost
       FROM unit_buckets ub
       JOIN units u
         ON u.project_id = ub.project_id
        AND LOWER(TRIM(u.name)) = ub.key_name
     ),
     task_weights AS (
       SELECT t.id AS task_id,
              um.unit_id,
              um.sum_hours,
              um.sum_cost,
              COALESCE(NULLIF(t.baseline_hours, 0), NULLIF(t.total_hours, 0), 1) AS weight
       FROM unit_match um
       JOIN tasks t ON t.unit_id = um.unit_id
     ),
     unit_totals AS (
       SELECT unit_id, SUM(weight) AS total_weight
       FROM task_weights
       GROUP BY unit_id
     ),
     alloc AS (
       SELECT task_id,
              SUM(tw.sum_hours * (tw.weight / NULLIF(ut.total_weight, 0))) AS ah,
              SUM(tw.sum_cost * (tw.weight / NULLIF(ut.total_weight, 0))) AS ac
       FROM task_weights tw
       JOIN unit_totals ut ON ut.unit_id = tw.unit_id
       GROUP BY task_id
     )
     UPDATE tasks t
        SET actual_hours = COALESCE(t.actual_hours, 0) + COALESCE(a.ah, 0),
            actual_cost = COALESCE(t.actual_cost, 0) + COALESCE(a.ac, 0),
            total_hours = COALESCE(t.actual_hours, 0) + COALESCE(a.ah, 0) + COALESCE(t.remaining_hours, 0),
            scheduled_cost = COALESCE(t.actual_cost, 0) + COALESCE(a.ac, 0) + COALESCE(t.remaining_cost, 0),
            updated_at = NOW()
       FROM alloc a
      WHERE t.id = a.task_id`,
    params,
  );
}
