-- Grant runtime access for server-side forms queries.
-- This app uses the Supabase secret/service role with db schema "forms".

grant usage on schema forms to service_role;
grant usage on type forms.questionnaire_status, forms.questionnaire_response_status, forms.question_type to service_role;

grant all on all tables in schema forms to service_role;
grant all on all sequences in schema forms to service_role;
grant all on all functions in schema forms to service_role;

alter default privileges in schema forms grant all on tables to service_role;
alter default privileges in schema forms grant all on sequences to service_role;
alter default privileges in schema forms grant all on functions to service_role;
alter default privileges in schema forms grant usage on types to service_role;
