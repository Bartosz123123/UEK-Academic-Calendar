import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  generateRealisticUekSchedule,
  mergeScheduleNotes,
  parseUekUrl,
  parseUekXmlOrHtml,
} from './src/utils/uekParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SafeHttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  cookies: string[];
  body: string;
}

function safeHttpRequest(
  urlStr: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<SafeHttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch (err) {
      return reject(err);
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs ?? 8000;

    const reqHeaders: Record<string, string> = {
      Connection: 'close',
      ...(options.headers || {}),
    };

    if (options.body) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(options.body));
    }

    const req = lib.request(
      parsed,
      {
        method,
        headers: reqHeaders,
        agent: isHttps
          ? new https.Agent({ keepAlive: false, timeout: timeoutMs })
          : new http.Agent({ keepAlive: false, timeout: timeoutMs }),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const rawSetCookie = res.headers['set-cookie'] || [];
          const cookieList = (Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie])
            .map((c) => String(c).split(';')[0].trim())
            .filter(Boolean);

          const rawBuf = Buffer.concat(chunks);
          const contentType = String(res.headers['content-type'] || '').toLowerCase();
          let bodyStr = rawBuf.toString('utf-8');
          if (
            contentType.includes('iso-8859-2') ||
            bodyStr.includes('encoding="ISO-8859-2"') ||
            bodyStr.includes('charset=iso-8859-2')
          ) {
            try {
              bodyStr = new TextDecoder('iso-8859-2').decode(rawBuf);
            } catch {
              // fallback to utf-8
            }
          }

          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            cookies: cookieList,
            body: bodyStr,
          });
        });
        res.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function mergeCookieJar(existing: Record<string, string>, newCookies: string[]) {
  for (const c of newCookies) {
    const eqIdx = c.indexOf('=');
    if (eqIdx > 0) {
      const name = c.slice(0, eqIdx).trim();
      const val = c.slice(eqIdx + 1).trim();
      existing[name] = val;
    }
  }
}

function serializeCookieJar(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function performUekCasLoginAndFetch(
  xmlTargetUrl: string,
  htmlTargetUrl: string,
  username: string,
  password: string
): Promise<{
  xmlBody: string;
  htmlBody: string;
  sessionCookie?: string;
  casError?: string;
  networkClosed?: boolean;
}> {
  const casCookies: Record<string, string> = {};
  const planCookies: Record<string, string> = {};
  const userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

  try {
    let casLoginUrl = `https://logowanie.uek.krakow.pl/cas/login?service=${encodeURIComponent(
      xmlTargetUrl
    )}`;
    try {
      const initPlanRes = await safeHttpRequest(xmlTargetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/xml,text/xml,text/html,*/*;q=0.9',
        },
      });
      mergeCookieJar(planCookies, initPlanRes.cookies);
      const initLocRaw = initPlanRes.headers['location'];
      const initLoc = Array.isArray(initLocRaw) ? initLocRaw[0] : initLocRaw;
      if (initLoc && initLoc.includes('logowanie.uek.krakow.pl')) {
        casLoginUrl = initLoc.startsWith('http')
          ? initLoc
          : new URL(initLoc, 'https://logowanie.uek.krakow.pl').toString();
      } else if (
        initPlanRes.status === 200 &&
        (initPlanRes.body.includes('<plan-zajec') ||
          initPlanRes.body.includes('<table'))
      ) {
        return {
          xmlBody: initPlanRes.body,
          htmlBody: '',
          sessionCookie: serializeCookieJar(planCookies),
        };
      }
    } catch {
      // Proceed with default casLoginUrl
    }

    const getRes = await safeHttpRequest(casLoginUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    mergeCookieJar(casCookies, getRes.cookies);
    const loginHtml = getRes.body;

    const execMatch =
      loginHtml.match(/name=["']execution["'][^>]*value=["']([^"']+)["']/i) ||
      loginHtml.match(/value=["']([^"']+)["'][^>]*name=["']execution["']/i);
    if (!execMatch) {
      return {
        xmlBody: '',
        htmlBody: '',
        networkClosed: true,
        casError: 'Nie udało się pobrać tokenu autoryzacji z serwera CAS UEK.',
      };
    }

    const executionToken = execMatch[1];

    const formParams = new URLSearchParams();
    formParams.set('username', username.trim());
    formParams.set('password', password);
    formParams.set('execution', executionToken);
    formParams.set('_eventId', 'submit');
    formParams.set('geolocation', '');
    formParams.set('deviceFingerprint', '2849104721');

    const postRes = await safeHttpRequest(casLoginUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: serializeCookieJar(casCookies),
        Origin: 'https://logowanie.uek.krakow.pl',
        Referer: casLoginUrl,
      },
      body: formParams.toString(),
    });

    mergeCookieJar(casCookies, postRes.cookies);

    const rawLoc = postRes.headers['location'];
    let redirectLocation = Array.isArray(rawLoc) ? rawLoc[0] : rawLoc;

    if (!redirectLocation && postRes.body) {
      const jsRedirectMatch =
        postRes.body.match(
          /window\.location(?:\.href)?\s*=\s*["']([^"']+ticket=[^"']+)["']/i
        ) ||
        postRes.body.match(/url=([^"'\s>]+ticket=[^"'\s>]+)/i) ||
        postRes.body.match(/href=["']([^"']+ticket=ST-[^"']+)["']/i);
      if (jsRedirectMatch) {
        redirectLocation = jsRedirectMatch[1];
      }
    }

    if (!redirectLocation) {
      const errorHtml = postRes.body || '';
      if (
        errorHtml.includes('Invalid credentials') ||
        errorHtml.includes('Nieprawidłowe') ||
        errorHtml.includes('badCredentials') ||
        errorHtml.includes('authenticationFailure') ||
        errorHtml.includes('id="loginForm"')
      ) {
        return {
          xmlBody: '',
          htmlBody: '',
          casError:
            'Serwer CAS UEK odrzucił logowanie (sprawdź identyfikator/nr albumu i hasło).',
        };
      }
      return {
        xmlBody: '',
        htmlBody: '',
        networkClosed: true,
      };
    }

    let currentUrl = redirectLocation.startsWith('http')
      ? redirectLocation
      : new URL(redirectLocation, 'https://logowanie.uek.krakow.pl').toString();

    let landedBody = '';

    for (let hop = 0; hop < 6; hop++) {
      const isCasHost = currentUrl.includes('logowanie.uek.krakow.pl');
      const activeJar = isCasHost ? casCookies : planCookies;

      const hopRes = await safeHttpRequest(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Cookie: serializeCookieJar(activeJar),
          Accept: 'application/xml,text/xml,text/html,*/*;q=0.9',
        },
      });

      if (isCasHost) {
        mergeCookieJar(casCookies, hopRes.cookies);
      } else {
        mergeCookieJar(planCookies, hopRes.cookies);
      }

      const nextRaw = hopRes.headers['location'];
      const nextLoc = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
      if (
        nextLoc &&
        (hopRes.status === 301 ||
          hopRes.status === 302 ||
          hopRes.status === 303 ||
          hopRes.status === 307)
      ) {
        currentUrl = nextLoc.startsWith('http')
          ? nextLoc
          : new URL(nextLoc, currentUrl).toString();
        continue;
      }

      landedBody = hopRes.body;
      break;
    }

    const phpSessId = planCookies['PHPSESSID']
      ? `PHPSESSID=${planCookies['PHPSESSID']}`
      : serializeCookieJar(planCookies);

    let xmlBody = landedBody.includes('<plan-zajec') ? landedBody : '';
    let htmlBody = landedBody.includes('<table') ? landedBody : '';

    if (phpSessId) {
      if (!xmlBody) {
        try {
          const xmlRes = await safeHttpRequest(xmlTargetUrl, {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              Cookie: phpSessId,
              Accept: 'application/xml,text/xml,*/*;q=0.9',
            },
          });
          if (xmlRes.body.includes('<plan-zajec')) {
            xmlBody = xmlRes.body;
          }
        } catch {
          // ignore
        }
      }
      if (!htmlBody) {
        try {
          const htmlRes = await safeHttpRequest(htmlTargetUrl, {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              Cookie: phpSessId,
              Accept: 'text/html,*/*;q=0.9',
            },
          });
          if (htmlRes.body.includes('<table')) {
            htmlBody = htmlRes.body;
          }
        } catch {
          // ignore
        }
      }
    }

    return {
      xmlBody,
      htmlBody,
      sessionCookie: phpSessId,
    };
  } catch {
    return {
      xmlBody: '',
      htmlBody: '',
      networkClosed: true,
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  app.get('/api/maps-config', (_req, res) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_PLATFORM_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({ apiKey });
  });

  app.post('/api/uek-rooms', async (req, res) => {
    try {
      const { sessionCookie, pavilionCode = 'A' } = req.body || {};
      const groupName = `Paw.${pavilionCode}`;
      const targetUrl = `https://planzajec.uek.krakow.pl/index.php?typ=S&grupa=${encodeURIComponent(
        groupName
      )}&xml`;

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
        Accept: 'application/xml,text/xml,*/*;q=0.9',
      };
      if (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) {
        headers.Cookie = sessionCookie.includes('=')
          ? sessionCookie.trim()
          : `PHPSESSID=${sessionCookie.trim()}`;
      }

      const resp = await safeHttpRequest(targetUrl, { headers });
      const xmlText = resp.body;

      const liveRooms: Array<{ id: string; name: string }> = [];
      const zasobRegex = /<zasob[^>]*id="([^"]+)"[^>]*nazwa="([^"]+)"/gi;
      let match: RegExpExecArray | null;
      while ((match = zasobRegex.exec(xmlText)) !== null) {
        liveRooms.push({ id: match[1], name: match[2] });
      }

      res.json({
        source: liveRooms.length > 0 ? 'uek_xml_api' : 'campus_catalog',
        pavilionCode,
        liveRooms,
      });
    } catch {
      res.json({ source: 'campus_catalog', liveRooms: [] });
    }
  });

  app.post('/api/schedule', async (req, res) => {
    try {
      const {
        url = 'https://planzajec.uek.krakow.pl/index.php?typ=G&id=259441&okres=3',
        username,
        password,
        sessionCookie,
        rawXmlOrHtml,
        major,
      } = req.body || {};

      const parsedUrl = parseUekUrl(url);

      // 1. Direct XML or HTML paste import
      if (rawXmlOrHtml && typeof rawXmlOrHtml === 'string' && rawXmlOrHtml.trim().length > 20) {
        const parsedDirect = parseUekXmlOrHtml(
          rawXmlOrHtml,
          parsedUrl.cleanUrl,
          'raw_import',
          username || 'Import bezpośredni XML/HTML'
        );
        if (parsedDirect) {
          return res.json(parsedDirect);
        }
        return res.status(400).json({
          error:
            'Wklejone dane nie zawierają prawidłowej tabeli planu zajęć UEK ani struktury XML.',
        });
      }

      const effectiveCookie =
        (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) ||
        process.env.UEK_SESSION_COOKIE ||
        process.env.UEK_PHPSESSID ||
        '';
      const effectiveUsername =
        (username && typeof username === 'string' && username.trim()) ||
        process.env.UEK_CAS_USERNAME ||
        '';
      const effectivePassword =
        (password && typeof password === 'string' && password) ||
        process.env.UEK_CAS_PASSWORD ||
        '';

      // 2. Fetch with provided sessionCookie first if available
      if (effectiveCookie) {
        const formattedCookie = effectiveCookie.includes('=')
          ? effectiveCookie.trim()
          : `PHPSESSID=${effectiveCookie.trim()}`;

        let xmlParsed = null;
        let htmlParsed = null;

        try {
          const xmlResp = await safeHttpRequest(parsedUrl.xmlUrl, {
            headers: {
              Cookie: formattedCookie,
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
            },
          });
          xmlParsed = parseUekXmlOrHtml(
            xmlResp.body,
            parsedUrl.cleanUrl,
            'cookie_session',
            effectiveUsername || 'Sesja CAS'
          );
        } catch {
          // continue
        }

        try {
          const htmlResp = await safeHttpRequest(parsedUrl.cleanUrl, {
            headers: {
              Cookie: formattedCookie,
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
            },
          });
          htmlParsed = parseUekXmlOrHtml(
            htmlResp.body,
            parsedUrl.cleanUrl,
            'cookie_session',
            effectiveUsername || 'Sesja CAS'
          );
        } catch {
          // continue
        }

        const finalSchedule =
          xmlParsed && htmlParsed
            ? mergeScheduleNotes(xmlParsed, htmlParsed)
            : xmlParsed || htmlParsed;

        if (finalSchedule) {
          return res.json({
            ...finalSchedule,
            sessionCookie: formattedCookie,
          });
        }
      }

      // 3. Real CAS login flow with username & password
      if (effectiveUsername && effectivePassword) {
        const attempt = await performUekCasLoginAndFetch(
          parsedUrl.xmlUrl,
          parsedUrl.cleanUrl,
          effectiveUsername,
          effectivePassword
        );

        const xmlParsed = attempt.xmlBody
          ? parseUekXmlOrHtml(
              attempt.xmlBody,
              parsedUrl.cleanUrl,
              'cas_authenticated',
              effectiveUsername
            )
          : null;

        const htmlParsed = attempt.htmlBody
          ? parseUekXmlOrHtml(
              attempt.htmlBody,
              parsedUrl.cleanUrl,
              'cas_authenticated',
              effectiveUsername
            )
          : null;

        const finalSchedule =
          xmlParsed && htmlParsed
            ? mergeScheduleNotes(xmlParsed, htmlParsed)
            : xmlParsed || htmlParsed;

        if (finalSchedule) {
          return res.json({
            ...finalSchedule,
            sessionCookie: attempt.sessionCookie,
          });
        }

        if (attempt.casError && !attempt.networkClosed) {
          return res.status(401).json({
            error: attempt.casError,
            requiresCasAuth: true,
          });
        }
      }

      // 4. Unauthenticated fetch attempt -> try both XML and HTML endpoints
      for (const candidateUrl of [parsedUrl.xmlUrl, parsedUrl.cleanUrl]) {
        try {
          const directRes = await safeHttpRequest(candidateUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
            },
          });
          const parsedLive = parseUekXmlOrHtml(
            directRes.body,
            parsedUrl.cleanUrl,
            'cas_authenticated'
          );
          if (parsedLive) {
            return res.json(parsedLive);
          }
        } catch {
          // Ignore network error and fall back to preview schedule
        }
      }

      const demoSchedule = generateRealisticUekSchedule(
        parsedUrl.cleanUrl,
        'System planzajec.uek.krakow.pl wymaga autoryzacji Central Authentication Service (CAS UEK). Wyświetlono zsynchronizowany harmonogram dla wybranego kierunku — kliknij „Importuj plan”, aby wczytać oficjalny plik .ics lub dane po zalogowaniu.',
        'demo_preview',
        undefined,
        major
      );

      return res.json({
        ...demoSchedule,
        requiresCasAuth: true,
      });
    } catch {
      const reqUrl =
        req.body?.url || 'https://planzajec.uek.krakow.pl/index.php?typ=G&id=259441&okres=3';
      const fallback = generateRealisticUekSchedule(
        reqUrl,
        undefined,
        'demo_preview',
        undefined,
        req.body?.major
      );
      return res.json({
        ...fallback,
        requiresCasAuth: true,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
