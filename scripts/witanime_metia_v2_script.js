const BASE_URL = 'https://witanime.art/';


/**
 *Main streaming data episode function
 */

async function getEpisodeStreamData(episodeUrl) {
  function detectExtractor(url) {
    for (const key of Object.keys(extractors)) {
      if (url.includes(key)) return key;
    }
    return null;
  }

  async function streamwishExtractor(url) {
    function convertToWitanimeStyle(m3u8Url) {
      const url = new URL(m3u8Url.replace("master.m3u8", "index-v1-a1.m3u8"));

      // 1. extract srv param → firstData
      const firstData = url.searchParams.get("srv");
      if (!firstData) {
        throw new Error("srv parameter missing");
      }

      // 2. extract path after /hls2/
      const pathMatch = url.pathname.match(/\/hls2\/(.+)\/index-v1/);
      if (!pathMatch) {
        throw new Error("Invalid hls2 path format");
      }

      const secondData = pathMatch[1];

      // 3. build final URL
      return `https://drrh37sqosrl.harborlightartisanworks.cyou/${firstData}/hls3/${secondData}/master.txt`;
    }
    let link = url;
    if (url.includes("gradehgplus.com")) {
      link = url.replace("gradehgplus.com", "cavanhabg.com");
    } else if (url.includes("hgplus.in")) {
      link = url.replace("hgplus.in", "cavanhabg.com")
    } else if (url.includes("cavanhabg.com")) {
      link = url.replace("cavanhabg.com", "cavanhabg.com");
    }

    const res = await fetchViaNative(link, { Referer: link, Origin: link, Accept: "*/*" });
    if (!res) throw new Error(`Failed to fetch ${link}: ${res.status}`);
    const html = res.body; // ✅ use .body

    function unpackJs(packed) {
      const match = packed.match(/eval(.*?)\n<\/script>/s);
      if (!match) return null;
      const wrapped = `var data = ${match[1]}; data;`;
      return eval(wrapped);
    }

    const unpacked = unpackJs(html);
    const m3u8Match = unpacked?.match(/(https:\/\/[^\s"']+\.m3u8(?:\?[^\s"']*)?)/);
    // return m3u8Match ? m3u8Match[1].replace("master.m3u8", "index-v1-a1.m3u8") : null;
    return m3u8Match ? convertToWitanimeStyle(m3u8Match[1]) : null;
  }

  async function videaExtractor(url) {
    const STATIC_SECRET = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';

    function rc4(cipherText, key) {
      let res = '';
      const keyLen = key.length;
      let S = Array.from({ length: 256 }, (_, i) => i);

      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + S[i] + key.charCodeAt(i % keyLen)) % 256;
        [S[i], S[j]] = [S[j], S[i]];
      }

      let i = 0;
      j = 0;
      for (let m = 0; m < cipherText.length; m++) {
        i = (i + 1) % 256;
        j = (j + S[i]) % 256;
        [S[i], S[j]] = [S[j], S[i]];
        const k = S[(S[i] + S[j]) % 256];
        res += String.fromCharCode(k ^ cipherText.charCodeAt(m));
      }
      return res;
    }

    function searchRegex(pattern, string, name) {
      const match = string.match(pattern);
      if (!match) throw new Error(`Could not find ${name}`);
      return match[1];
    }

    function randomString(len) {
      return Array.from({ length: len }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 52)]).join('');
    }

    async function downloadPage(url, query) {
      let fullUrl = url;
      if (query) fullUrl = `${url}?${new URLSearchParams(query).toString()}`;
      const res = await fetchViaNative(fullUrl);
      //const res = res1.body;
      if (!res) throw new Error('Network response was not ok');
      return [await res.body, null, res.headers];
    }

    function parseVideoSources(xml) {
      const formats = [];
      const videoSourceRegex = /<video_source\b[^>]*name="([^"]+)"[^>]*height="([^"]+)"[^>]*exp="([^"]+)"?>([^<]+)<\/video_source>/g;
      const hashRegex = /<hash_value_([^>]+)>([^<]+)<\/hash_value_[^>]+>/g;

      // collect all hash values
      const hashValues = {};
      let hashMatch;
      while ((hashMatch = hashRegex.exec(xml)) !== null) {
        hashValues[hashMatch[1]] = hashMatch[2];
      }

      let match;
      while ((match = videoSourceRegex.exec(xml)) !== null) {
        const [_, name, height, exp, srcUrl] = match;
        let finalUrl = srcUrl;
        const hashValue = hashValues[name];
        if (hashValue && exp) finalUrl = `${srcUrl}?md5=${hashValue}&expires=${exp}`;
        formats.push({ url: finalUrl, quality: parseInt(height, 10) });
      }
      return formats.sort((a, b) => b.quality - a.quality);
    }

    try {
      // Main video page
      // const videoPage = await fetch(link).then(r => r.text());
      // let playerUrl = url.includes('videa.hu/player') ? url :
      //   new URL(searchRegex(/<iframe.*?src="(\/player\?[^"]+)"/, videoPage, 'player url'), url).href;

      // Player page
      const playerPage = await fetchViaNative(url).then(r => r.body);
      const nonce = searchRegex(/_xt\s*=\s*"([^"]+)"/, playerPage, 'nonce');
      const l = nonce.slice(0, 32);
      const s = nonce.slice(32);
      let result = '';
      for (let i = 0; i < 32; i++) {
        result += s[i - (STATIC_SECRET.indexOf(l[i]) - 31)];
      }

      const query = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
      const random_seed = randomString(8);
      query['_s'] = random_seed;
      query['_t'] = result.slice(0, 16);

      // Fetch XML info
      const [b64_info, status, headers] = await downloadPage('https://videa.hu/player/xml', query);
      let xml;
      if (b64_info.startsWith('<?xml')) {
        xml = b64_info;
      } else {
        const xVideaXs = headers.get('x-videa-xs') ?? '';
        const key = result.slice(16) + random_seed + xVideaXs;
        xml = rc4(atob(b64_info), key);
      }
      const results = parseVideoSources(xml);
      return "http:" + results[0].url; //TODO: in the future make this so the other resoulutions are also available not just the 720p
    } catch (e) {
      console.error('Videa extraction error:', e.message);
      // throw e;
      return "";
    }
  }



  const extractors = {
    "yonaplay": async (url) => null,
    "dailymotion": async (url) => null,
    "ok.ru": async (url) => null,
    "mp4upload.com": async (url) => null,
    "videa": async (url) => {
      return videaExtractor(url);
    },
    "hglink.to": async (url) => {
      return streamwishExtractor(url);
    },
    "cavanhabg.com": async (url) => {
      return streamwishExtractor(url);
    },
    "gradehgplus.com": async (url) => {
      return streamwishExtractor(url);
    },
    "playerwish.com": async (url) => {
      return streamwishExtractor(url);
    },
  };

  // === STEP 1: Get resourceRegistry/configRegistry/server names ===
  const res = await fetchViaNative(episodeUrl, { "User-Agent": "Mozilla/5.0" });
  const html = res.body; // ✅ use .body

  const zGMatch = html.match(/var\s+_zG\s*=\s*"([^"]+)"/);
  const zHMatch = html.match(/var\s+_zH\s*=\s*"([^"]+)"/);
  if (!zGMatch || !zHMatch) throw new Error("No _zG/_zH found");

  const resourceRegistry = JSON.parse(atob(zGMatch[1]));
  const configRegistry = JSON.parse(atob(zHMatch[1]));

  const serverNameRegex = /<span class="ser">([^<]+)<\/span>/g;
  const serverNames = [];
  let match;
  while (match = serverNameRegex.exec(html)) serverNames.push(match[1].trim());

  const FRAMEWORK_HASH = "1c0f3441-e3c2-4023-9e8b-bee77ff59adf";

  function getParamOffset(config) {
    const index = parseInt(atob(config.k), 10);
    return config.d[index];
  }

  // === STEP 2: Decode each resource URL ===
  const servers = resourceRegistry.map((resData, idx) => {
    let url = resData;
    if (typeof url === "string") {
      url = url.split("").reverse().join("").replace(/[^A-Za-z0-9+/=]/g, '');
      url = atob(url);

      if (configRegistry[idx]) {
        const offset = getParamOffset(configRegistry[idx]);
        url = url.slice(0, -offset);
      }

      if (/^https:\/\/yonaplay\.net\/embed\.php\?id=\d+$/.test(url)) {
        url += "&apiKey=" + FRAMEWORK_HASH;
      }
    }
    return {
      id: idx,
      name: serverNames[idx] || `server-${idx}`,
      url: url.startsWith("//") ? "https:" + url : url,
    };
  });

  // === STEP 3: Extract m3u8 links using extractors ===
  const validServers = [];
  for (let server of servers) {
    const extractorKey = detectExtractor(server.url);
    let m3u8 = null;
    if (extractorKey) {
      try {
        m3u8 = await extractors[extractorKey](server.url);
      } catch (e) {
        m3u8 = null;
      }
    } else {
      m3u8 = server.url;
    }

    if (m3u8) validServers.push({ ...server, m3u8 });
  }

  const streamingDataList = validServers.map(server => {
    return {
      isDub: false,                 // default value
      isSub: true,                  // default value
      link: server.url || "",       // original server URL
      m3u8Link: server.m3u8 || "", // extracted m3u8
      name: server.name || ""       // server name
    };
  });

  return {
    status: 'success',
    data: streamingDataList
  };
}



/**
 * Main wrapper to get anime episodes
 */
async function getAnimeEpisodeList(url) {
  function decodeProcessedEpisodeData(processedEpisodeData) {
    if (!processedEpisodeData || !processedEpisodeData.includes(".")) return [];

    const [dataB64, keyB64] = processedEpisodeData.split(".");
    const data = atob(dataB64);
    const key = atob(keyB64);

    let decoded = "";
    for (let i = 0; i < data.length; i++) {
      decoded += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }

    try {
      return JSON.parse(decoded);
    } catch (e) {
      return [];
    }
  }

  const res = await fetchViaNative(url);
  const data = res.body; // ✅ use .body

  const match = data.match(/processedEpisodeData\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error("processedEpisodeData not found");

  const processedEpisodeData = match[1];
  const decodedEpisodes = decodeProcessedEpisodeData(processedEpisodeData);
  if (!decodedEpisodes.length) throw new Error("No episodes found");

  const result = decodedEpisodes.map(ep => ({
    poster: ep.screenshot || "",
    name: ep.title || `Episode ${ep.number}`,
    url: ep.url,
    isSub: true,
    isDub: false,
  }));
  return {
    status: 'success',
    data: result
  };

}


/**
 * Main Search function
 */
async function searchAnime(keyword) {
  const res = await fetchViaNative(`${BASE_URL}?search_param=animes&s=${encodeURIComponent(keyword)}`);
  const data = res.body; // ✅ use .body
  const results = [];

  const cardRegex = /<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g;
  let cardMatch;

  while ((cardMatch = cardRegex.exec(data)) !== null) {
    const block = cardMatch[1];
    const get = (regex) => {
      const m = block.match(regex);
      return m ? m[1].trim() : null;
    };

    results.push({
      name: get(/alt="(.*?)"/),
      length: 0,
      poster: get(/<img[^>]+class="img-responsive"[^>]+src="([^"]+)"/),
      url: "https://witanime.you/anime/" + get(/<a href="https:\/\/witanime.you\/anime\/(.*?)"/),
    });
  }

  return {
    status: 'success',
    keyword,
    data: results
  };
}
