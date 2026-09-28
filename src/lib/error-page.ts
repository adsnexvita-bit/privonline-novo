export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Privadinhos Online</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <style>
      html, body { min-height: 100%; margin: 0; background: #faf9f7; color: #292421; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
      main { max-width: 420px; text-align: center; }
      h1 { margin: 0; font-size: 24px; line-height: 1.2; }
      p { margin: 12px 0 0; color: #736b67; line-height: 1.55; }
      button { margin-top: 24px; min-height: 48px; border: 0; border-radius: 12px; padding: 0 24px; background: #e9430c; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>Não foi possível carregar esta tela</h1>
      <p>Tente novamente em alguns instantes.</p>
      <button type="button" onclick="location.reload()">Tentar novamente</button>
    </main>
    <script>
      (function () {
        var attempt = 1;
        var now = Date.now();
        var key = "privadinhos:server-auto-recovery:" + location.pathname;
        try {
          var previous = JSON.parse(sessionStorage.getItem(key) || "null");
          if (previous && now - Number(previous.startedAt || 0) < 60000) {
            attempt = Number(previous.attempt || 0) + 1;
          }
          sessionStorage.setItem(key, JSON.stringify({
            startedAt: attempt === 1 ? now : previous.startedAt,
            attempt: attempt
          }));
        } catch (_) {}

        if (attempt === 1) {
          setTimeout(function () { location.reload(); }, 800);
        }
      })();
    </script>
  </body>
</html>`;
}
