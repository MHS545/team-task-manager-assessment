// Vercel rewrites attach a `path` parameter. Validate only the client's remaining query.
export function createVercelHandler(app) {
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    url.searchParams.delete('path');
    req.url = url.pathname + url.search;
    // The platform may prepopulate req.query. Let Express parse the normalized URL.
    req.query = undefined;
    return app(req, res);
  };
}
