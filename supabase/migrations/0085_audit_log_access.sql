-- 0085_audit_log_access.sql
-- Let view_audit_log holders read their server's audit trail.

drop policy if exists audit_log_mod_select on public.audit_log;
create policy audit_log_mod_select on public.audit_log
  for select using (
    public.member_has_server_permission(server_id, auth.uid(), 'view_audit_log')
  );
