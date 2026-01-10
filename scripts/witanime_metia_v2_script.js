/**
 *Main streaming data episode function
 */
async function getEpisodeStreamData(episodeUrl) {

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function normalizeQuality(quality) {
    if (!quality || quality === "default") return "720p";
    if (quality.match(/^\d+p$/)) return quality;

    const qualityMap = {
      'LQ': '240p',
      'SD': '480p',
      'HD': '720p',
      'FHD': '1080p'
    };

    return qualityMap[quality.toUpperCase()] || quality;
  }

  function cleanServerName(name) {
    // Remove quality suffixes
    name = name.replace(/\s*-\s*(LQ|SD|HD|FHD|\d+p)$/i, '').trim();

    // Remove yonaplay prefix and variations
    if (name.toLowerCase().match(/yona(play)?/)) {
      name = name.replace(/^yona(play)?\s*-?\s*(multi\s*-?\s*)?/i, '').trim();
    }

    return name || "unknown";
  }

  // ============================================================================
  // EXTRACTOR FUNCTIONS
  // ============================================================================

  async function streamwishExtractor(data) {
    const qualityInput = data.split("////")[1];
    url = data.split("////")[0];
    function convertToWitanimeStyle(m3u8Url) {
      url = new URL(m3u8Url.replace("master.m3u8", "index-v1-a1.m3u8"));
      firstData = url.searchParams.get("srv");
      if (!firstData) throw new Error("srv parameter missing");

      pathMatch = url.pathname.match(/\/hls2\/(.+)\/index-v1/);
      if (!pathMatch) throw new Error("Invalid hls2 path format");

      secondData = pathMatch[1];
      return `https://drrh37sqosrl.harborlightartisanworks.cyou/${firstData}/hls3/${secondData}/master.txt`;
    }

    let link = url
      .replace("gradehgplus.com", "cavanhabg.com")
      .replace("hgplus.in", "cavanhabg.com")
      .replace("hglink.to", "cavanhabg.com")
      .replace("hlswish.com", "cavanhabg.com")
      .replace("wishonly.site", "cavanhabg.com");

    res = await fetchViaNative(link, { Referer: link, Origin: link, Accept: "*/*" });
    if (!res) throw new Error(`Failed to fetch ${link}: ${res.status}`);

    html = res.body;

    function unpackJs(packed) {
      match = packed.match(/eval(.*?)\n<\/script>/s);
      if (!match) return null;
      wrapped = `var data = ${match[1]}; data;`;
      return eval(wrapped);
    }

    unpacked = unpackJs(html);
    m3u8Match = unpacked?.match(/(https:\/\/[^\s"']+\.m3u8(?:\?[^\s"']*)?)/);
    final = m3u8Match ? [{ url: convertToWitanimeStyle(m3u8Match[1]), quality: normalizeQuality(qualityInput) }] : [];

    return final;
  }

  async function videaExtractor(url) {
    STATIC_SECRET = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';

    function rc4(cipherText, key) {
      let res = '';
      keyLen = key.length;
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
        k = S[(S[i] + S[j]) % 256];
        res += String.fromCharCode(k ^ cipherText.charCodeAt(m));
      }
      return res;
    }

    function searchRegex(pattern, string, name) {
      match = string.match(pattern);
      if (!match) throw new Error(`Could not find ${name}`);
      return match[1];
    }

    function randomString(len) {
      return Array.from({ length: len }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 52)]
      ).join('');
    }

    async function downloadPage(url, query) {
      let fullUrl = url;
      if (query) fullUrl = `${url}?${new URLSearchParams(query).toString()}`;
      res = await fetchViaNative(fullUrl);
      if (!res) throw new Error('Network response was not ok');
      return [await res.body, null, res.headers];
    }

    function parseVideoSources(xml) {
      formats = [];
      videoSourceRegex = /<video_source\b[^>]*name="([^"]+)"[^>]*height="([^"]+)"[^>]*exp="([^"]+)"?>([^<]+)<\/video_source>/g;
      hashRegex = /<hash_value_([^>]+)>([^<]+)<\/hash_value_[^>]+>/g;

      hashValues = {};
      let hashMatch;
      while ((hashMatch = hashRegex.exec(xml)) !== null) {
        hashValues[hashMatch[1]] = hashMatch[2];
      }

      let match;
      while ((match = videoSourceRegex.exec(xml)) !== null) {
        [_, name, height, exp, srcUrl] = match;
        let finalUrl = srcUrl;
        hashValue = hashValues[name];
        if (hashValue && exp) finalUrl = `${srcUrl}?md5=${hashValue}&expires=${exp}`;
        formats.push({ url: finalUrl, quality: parseInt(height, 10) });
      }
      return formats.sort((a, b) => b.quality - a.quality);
    }

    try {
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
      return results.map(r => ({ url: "http:" + r.url, quality: `${r.quality}p` }));
    } catch (e) {
      console.error('Videa extraction error:', e.message);
      return [];
    }
  }

  async function dailymotionExtractor(url) {
    try {
      res = await fetchViaNative("https://www.dailymotion.com/player/metadata/video/" + url.split("video/")[1],
        { "User-Agent": "Mozilla/5.0" });
      if (!res) throw new Error(`Failed to fetch ${url}: ${res.status}`);

      json = JSON.parse(res.body);
      m3u8Link = json.qualities?.auto?.[0]?.url || null;
      if (!m3u8Link) return [];

      sources = [];
      hlsStream = await fetchViaNative(m3u8Link);
      hls = hlsStream.body;

      if (hls) {
        hlsLines = hls.split("\n");
        for (let i = 0; i < hlsLines.length; i++) {
          if (hlsLines[i].includes("RESOLUTION=")) {
            resMatch = hlsLines[i].match(/RESOLUTION=(\d+)x(\d+)/);
            if (resMatch) {
              height = parseInt(resMatch[2], 10);
              let quality = `${height}p`;
              let streamUrl = hlsLines[i + 1];

              if (streamUrl && !streamUrl.startsWith("#")) {
                if (!streamUrl.startsWith("http")) {
                  const baseUrl = m3u8Link.substring(0, m3u8Link.lastIndexOf("/") + 1);
                  streamUrl = baseUrl + streamUrl;
                }
                sources.push({ url: streamUrl, quality: quality });
              }
            }
          }
        }
      }
      return sources;
    } catch (e) {
      console.error('Dailymotion extraction error:', e);
      return [];
    }
  }

  async function yonaplayExtractor(url) {
    res = await fetchViaNative(url, { Referer: "https://witanime.you", Origin: url, Accept: "*/*" });
    if (!res) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    html = res.body;
    regex = /go_to_player\('([^']+)'\)[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<p>\s*([A-Z]+)/g;
    sourcesList = [];

    let match;
    while ((match = regex.exec(html)) !== null) {
      base64Url = match[1];
      server = match[2].trim();
      quality = match[3].trim();

      let decodedUrl;
      try {
        decodedUrl = atob(base64Url);
      } catch {
        decodedUrl = null;
      }

      if (decodedUrl) {
        sourcesList.push({ server, quality, url: decodedUrl });
      }
    }

    // Sub-extractors for different hosts
    async function extract4shared(url, quality) {
      try {
        regex = /https:(.*?)preview.mp4/;
        body = (await fetchViaNative(url)).body;
        m3u8Match = body.match(regex);
        return m3u8Match ? [{ url: `https:${m3u8Match[1]}preview.mp4`, quality: /*normalizeQuality(quality)*/ '480p', source: '4shared' }] : [];
      } catch (e) {
        console.error('4shared extraction error:', e);
        return [];
      }
    }

    async function extractGoogleDrive(url, quality) {
      try {
        id = url.split("/")[5];
        m3u8Link = "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t";
        return m3u8Link ? { url: m3u8Link, quality: normalizeQuality(quality), source: 'Google Drive' } : [];
      } catch (e) {
        console.error('Google Drive extraction error:', e);
        return [];
      }
    }

    // Process all sources in parallel
    const extractionPromises = sourcesList.map(async (item) => {
      const serverLower = item.server.toLowerCase();

      if (serverLower === 'www.4shared.com') {
        return await extract4shared(item.url, item.quality);
      } else if (serverLower === 'drive.google.com') {
        return await extractGoogleDrive(item.url, item.quality);
      } else if (serverLower === 'mega.nz') {
        // Not implemented yet
        return [];
      }
      return [];
    });

    const allResults = await Promise.all(extractionPromises);
    return allResults.flat();
  }

  // ============================================================================
  // EXTRACTOR REGISTRY
  // ============================================================================

  const extractors = {
    "ok.ru": async (url) => [],
    "mp4upload.com": async (url) => [],
    "dailymotion": dailymotionExtractor,
    "yonaplay": yonaplayExtractor,
    "videa": videaExtractor,
    "hglink.to": streamwishExtractor,
    "cavanhabg.com": streamwishExtractor,
    "gradehgplus.com": streamwishExtractor,
    "playerwish.com": streamwishExtractor,
    "hlswish.com": streamwishExtractor,
    "wishonly.site": streamwishExtractor,
  };

  function detectExtractor(url) {
    for (const key of Object.keys(extractors)) {
      if (url.includes(key)) return key;
    }
    return null;
  }

  // ============================================================================
  // SERVER PARSING
  // ============================================================================

  async function getServers(url) {
    res = await fetchViaNative(url, { "User-Agent": "Mozilla/5.0" });
    html = res.body;

    zGMatch = html.match(/var\s+_zG\s*=\s*"([^"]+)"/);
    zHMatch = html.match(/var\s+_zH\s*=\s*"([^"]+)"/);
    if (!zGMatch || !zHMatch) throw new Error("No _zG/_zH found");

    resourceRegistry = JSON.parse(atob(zGMatch[1]));
    configRegistry = JSON.parse(atob(zHMatch[1]));

    serverNameRegex = /<span class="ser">([^<]+)<\/span>/g;
    serverNames = [];
    let match;
    while (match = serverNameRegex.exec(html)) {
      serverNames.push(match[1].trim());
    }

    FRAMEWORK_HASH = "1c0f3441-e3c2-4023-9e8b-bee77ff59adf";

    function getParamOffset(config) {
      index = parseInt(atob(config.k), 10);
      return config.d[index];
    }

    return resourceRegistry.map((resData, idx) => {
      let url = resData;
      if (typeof url === "string") {
        url = url.split("").reverse().join("").replace(/[^A-Za-z0-9+/=]/g, '');
        url = atob(url);

        if (configRegistry[idx]) {
          offset = getParamOffset(configRegistry[idx]);
          url = url.slice(0, -offset);
        }

        if (/^https:\/\/yonaplay\.net\/embed\.php\?id=\d+$/.test(url)) {
          url += "&apiKey=" + FRAMEWORK_HASH;
        }
      }
      namee = "";
      if (serverNames[idx] && serverNames[idx].toLowerCase().includes("streamwish")) {
        namee = serverNames[idx];
      } else {
        namee = cleanServerName(serverNames[idx] || `server-${idx}`);
      }



      return {
        id: idx,
        name: namee,
        url: (url.startsWith("//") ? "https:" + url : url).trim(),
      };
    });
  }

  // ============================================================================
  // STREAM EXTRACTION & PROCESSING
  // ============================================================================

  async function extractStreams(servers) {
    const extractionPromises = servers.map(async (server) => {
      const extractorKey = detectExtractor(server.url);
      let extractedSources = [];

      if (extractorKey) {
        try {
          if (server.name.toLowerCase().includes("streamwish")) {
            qualityPart = server.name.split(" - ")[1] ?? "HD";
            if (!qualityPart) {
              qualityPart = "HD";
            }
            extractedSources = await extractors[extractorKey](server.url + "////" + qualityPart);
          } else {
            extractedSources = await extractors[extractorKey](server.url);
          }

          if (!Array.isArray(extractedSources)) {
            extractedSources = extractedSources ? [extractedSources] : [];
          }
        } catch (e) {
          console.error(`Extractor error for ${server.name}:`, e);
          extractedSources = [];
        }
      } else {
        extractedSources = [{ url: server.url, quality: "720p" }];
      }

      return extractedSources.map(source => ({
        serverName: server.name,
        sourceName: source.source || null,
        url: server.url,
        m3u8: source.url,
        quality: source.quality || "720p"
      }));
    });

    const results = await Promise.all(extractionPromises);
    return results.flat().filter(s => s.m3u8);
  }

  function buildStreamList(streams) {
    return streams.map(stream => {
      const quality = normalizeQuality(stream.quality);
      let displayName;

      // If source name exists (from multi-source extractors like yonaplay), use it
      // Otherwise use server name
      if (stream.sourceName) {
        displayName = `${stream.sourceName} (${quality})`;
      } else {
        displayName = `${stream.serverName} (${quality})`;
      }

      return {
        isDub: false,
        isSub: true,
        link: stream.url,
        m3u8Link: stream.m3u8,
        name: displayName,
        quality: quality
      };
    });
  }

  function addBackupLabels(streamList) {
    const seenNames = new Map();
    const primaryStreams = [];
    const backupStreams = [];

    streamList.forEach(item => {
      const baseName = item.name;

      if (!seenNames.has(baseName)) {
        seenNames.set(baseName, 1);
        primaryStreams.push(item);
      } else {
        const count = seenNames.get(baseName);
        seenNames.set(baseName, count + 1);
        const backupItem = { ...item };
        backupItem.name = backupItem.name.replace(/\((\d+p)\)$/, `($1) - Backup ${count}`);
        backupStreams.push(backupItem);
      }
    });

    // Sort backups by quality as well
    backupStreams.sort((a, b) => {
      const getResolution = (q) => parseInt(q.replace('p', '')) || 0;
      return getResolution(b.quality) - getResolution(a.quality);
    });

    // Return primaries first, then all backups
    return [...primaryStreams, ...backupStreams];
  }

  function sortByQuality(streamList) {
    return streamList.sort((a, b) => {
      const getResolution = (q) => parseInt(q.replace('p', '')) || 0;
      const resA = getResolution(a.quality);
      const resB = getResolution(b.quality);
      return resB - resA; // Higher resolution first
    });
  }

  // ============================================================================
  // MAIN EXECUTION
  // ============================================================================

  const servers = await getServers(episodeUrl);
  const streams = await extractStreams(servers);
  streamsCleaned = streams.map(s => ({
    ...s,
    serverName: s.serverName.replace(/\s*-\s*(LQ|SD|HD|FHD|\d+p)$/i, '').trim()
  }));
  let streamingDataList = buildStreamList(streamsCleaned);
  streamingDataList = sortByQuality(streamingDataList);
  streamingDataList = addBackupLabels(streamingDataList);

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
  const res = await fetchViaNative(`https://witanime.art/?search_param=animes&s=${encodeURIComponent(keyword)}`);
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
