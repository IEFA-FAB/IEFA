-- Analytics chat RPC
-- Executa SELECTs validados pela aplicação e retorna as linhas como JSON.

CREATE OR REPLACE FUNCTION sisub.execute_analytics_query(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sisub, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF query IS NULL OR btrim(query) = '' THEN
    RAISE EXCEPTION 'Query vazia';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t',
    query
  )
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
