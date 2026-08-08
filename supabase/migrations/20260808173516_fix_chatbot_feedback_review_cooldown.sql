-- Repair the reviewed-theme cooldown path. GREATEST is PostgreSQL expression
-- syntax and cannot be qualified as a pg_catalog function.
do $repair$
declare
  function_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.record_chatbot_feedback_observation(uuid,text,text,text)'::pg_catalog.regprocedure
  );

  if pg_catalog.strpos(function_definition, 'pg_catalog.greatest') > 0 then
    execute pg_catalog.replace(function_definition, 'pg_catalog.greatest', 'greatest');
  end if;
end
$repair$;

revoke all on function public.record_chatbot_feedback_observation(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_chatbot_feedback_observation(uuid, text, text, text)
  to service_role;
