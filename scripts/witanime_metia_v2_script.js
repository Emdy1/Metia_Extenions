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
    return m3u8Match ? m3u8Match[1].replace("master.m3u8", "index-v1-a1.m3u8") : null;
  }

  const extractors = {
    "yonaplay": async (url) => {
      const html = (await fetchViaNative(url)).body; // ✅ use .body
      const m = html.match(/source\s*:\s*["']([^"']+\.m3u8)["']/);
      return m ? m[1] : null;
    },
    "videa": async (url) => null,
    "dailymotion": async (url) => {
      const idMatch = url.match(/video\/([^_]+)/);
      if (!idMatch) return null;
      const id = idMatch[1];
      const json = (await fetchViaNative(`https://www.dailymotion.com/player/metadata/video/${id}`)).body;
      return json?.qualities?.auto?.[0]?.url || null;
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
    "ok.ru": async (url) => null
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
      url,
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
