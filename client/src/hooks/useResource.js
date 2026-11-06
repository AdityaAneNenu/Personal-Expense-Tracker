import { useCallback, useEffect, useState } from "react";
import { request } from "../lib/api";

export default function useResource(path) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    data: null,
    meta: null,
    loading: true,
    error: null,
  });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    request(path, { signal: controller.signal })
      .then((result) => {
        setState({
          data: result.data,
          meta: result.meta || null,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setState({ data: null, meta: null, loading: false, error });
      });
    return () => controller.abort();
  }, [path, revision]);
  return { ...state, reload };
}
