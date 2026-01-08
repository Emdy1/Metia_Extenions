/**
 *Main streaming data episode function
 */
async function getEpisodeStreamData(episodeUrl) {
  // Helper function to normalize quality to LQ/SD/HD/FHD format
  function normalizeQuality(quality) {
    if (!quality || quality === "default") return "HD";

    // If already in LQ/SD/HD/FHD format, return as-is
    if (['LQ', 'SD', 'HD', 'FHD'].includes(quality.toUpperCase())) {
      return quality.toUpperCase();
    }

    // Convert pixel-based quality to LQ/SD/HD/FHD
    const qualityMap = {
      '144p': 'LQ',
      '240p': 'LQ',
      '360p': 'SD',
      '480p': 'SD',
      '720p': 'HD',
      '1080p': 'FHD',
      '1440p': 'FHD',
      '2160p': 'FHD'
    };

    return qualityMap[quality] || 'HD';
  }

  async function streamwishExtractor(url) {
    function convertToWitanimeStyle(m3u8Url) {
      url = new URL(m3u8Url.replace("master.m3u8", "index-v1-a1.m3u8"));
      // 1. extract srv param → firstData
      firstData = url.searchParams.get("srv");
      if (!firstData) {
        throw new Error("srv parameter missing");
      }
      // 2. extract path after /hls2/
      pathMatch = url.pathname.match(/\/hls2\/(.+)\/index-v1/);
      if (!pathMatch) {
        throw new Error("Invalid hls2 path format");
      }
      secondData = pathMatch[1];
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
    } else if (url.includes("hglink.to")) {
      link = url.replace("hglink.to", "cavanhabg.com");
    } else if (url.includes("hlswish.com")) {
      link = url.replace("hlswish.com", "cavanhabg.com");
    }
    
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
    // Return with HD as default quality
    return m3u8Match ? [{ m3u8: convertToWitanimeStyle(m3u8Match[1]), quality: "HD" }] : [];
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
      return Array.from({ length: len }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 52)]).join('');
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
      // collect all hash values
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
      // Return all available qualities with pixel format
      return results.map(r => ({ m3u8: "http:" + r.url, quality: `${r.quality}p` }));
    } catch (e) {
      console.error('Videa extraction error:', e.message);
      return [];
    }
  }

  async function yonaplayExtractor(url) {
    res = await fetchViaNative(url, { Referer: "https://witanime.you", Origin: url, Accept: "*/*" });
    if (!res) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    html = res.body;
    regex = /go_to_player\('([^']+)'\)[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<p>\s*([A-Z]+)/g;
    results = [];
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
      results.push({
        server,
        quality,
        encoded: base64Url,
        url: decodedUrl
      });
    }

    async function megaExtractor(url) {
      return [];
    }

    async function fourSharedExtractor(url) {
      try {
        regex = /https:(.*?)preview.mp4/;
        body = (await fetchViaNative(url)).body;
        m3u8Match = body.match(regex);
        return m3u8Match ? [`https:${m3u8Match[1]}preview.mp4`] : [];
      } catch (e) {
        console.error('4shared extraction error:', e);
        return [];
      }
    }

    async function googleDriveExtractor(url) {
      try {
        link = "https://drive.google.com/get_video_info?docid=" + url.split("/")[5];
        res = await fetchViaNative(link, { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36" });
        if (!res) throw new Error(`Failed to fetch ${link}: ${res.status}`);
        html = res.body;
        return parseGdocs(html);

        function parseGdocs(html, itagMap = {}) {
          function getVideoResolution(itag) {
            const videoCode = {
              '18': 'SD',
              '59': 'SD',
              '22': 'HD',
              '37': 'FHD'
            };
            return videoCode[itag] || 'SD';
          }
          const sources = [];
          // error handling
          if (html.includes('error')) {
            const reasonMatch = html.match(/reason=([^&]+)/);
            if (reasonMatch) {
              const reason = decodeURIComponent(reasonMatch[1].replace(/\+/g, ' '));
              throw new Error(reason);
            }
            throw new Error('Unknown Google Docs error');
          }
          // extract fmt_stream_map
          const fmtMatch = html.match(/fmt_stream_map=([^&]+)/);
          if (!fmtMatch) {
            throw new Error('fmt_stream_map not found');
          }
          // decode the whole stream map
          const value = decodeURIComponent(fmtMatch[1]);
          const items = value.split(',');
          for (const item of items) {
            const parts = item.split('|');
            if (parts.length !== 2) continue;
            const itag = parts[0];
            let sourceUrl = parts[1];
            // decode escaped sequences + URL encoding
            try {
              sourceUrl = decodeURIComponent(sourceUrl);
            } catch (_) { }
            const quality = itagMap[itag] || getVideoResolution(itag);
            sources.push({ url: sourceUrl, quality: quality });
          }
          return sources;
        }
      } catch (e) {
        console.error('Google Drive extraction error:', e);
        return [];
      }
    }

    // Process all results and extract URLs in parallel
    const extractionPromises = results.map(async (result) => {
      let extractedSources = [];
      let serverName = result.server;

      switch (result.server.toLowerCase()) {
        case 'mega.nz':
          extractedSources = await megaExtractor(result.url);
          serverName = 'Mega';
          break;
        case 'www.4shared.com':
          {
            const urls = await fourSharedExtractor(result.url);
            // 4shared returns just URLs, so wrap them with quality from yonaplay
            extractedSources = urls.map(url => ({ url, quality: result.quality }));
            serverName = '4shared';
          }
          break;
        case 'drive.google.com':
          {
            // const sources = await googleDriveExtractor(result.url);
            const sources = [];
            // Google Drive returns {url, quality} objects already
            extractedSources = sources;
            serverName = 'Google Drive';
          }
          break;
        default:
          return [];
      }

      // Return array of results with quality info
      if (Array.isArray(extractedSources) && extractedSources.length > 0) {
        return extractedSources.map(source => ({
          m3u8: source.url || source,
          quality: source.quality || result.quality,
          serverName: serverName
        }));
      }
      return [];
    });

    const allResults = await Promise.all(extractionPromises);
    return allResults.flat();
  }

  async function dailymotionExtractor(url) {
    try {
      res = await fetchViaNative("https://www.dailymotion.com/player/metadata/video/" + url.split("video/")[1], { "User-Agent": "Mozilla/5.0" });
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
              let quality = "LQ";
              if (height >= 360) quality = "SD";
              if (height >= 720) quality = "HD";
              if (height >= 1080) quality = "FHD";

              // Get the actual m3u8 URL from the next line
              let streamUrl = hlsLines[i + 1];
              if (streamUrl && !streamUrl.startsWith("#")) {
                // Make relative URLs absolute
                if (!streamUrl.startsWith("http")) {
                  const baseUrl = m3u8Link.substring(0, m3u8Link.lastIndexOf("/") + 1);
                  streamUrl = baseUrl + streamUrl;
                }
                sources.push({ m3u8: streamUrl, quality: quality });
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

  function detectExtractor(url) {
    for (key of Object.keys(extractors)) {
      if (url.includes(key)) return key;
    }
    return null;
  }

  extractors = {
    "ok.ru": async (url) => [],
    "mp4upload.com": async (url) => [],
    "dailymotion": async (url) => {
      return dailymotionExtractor(url);
    },
    "yonaplay": async (url) => {
      return yonaplayExtractor(url);
    },
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
    "hlswish.com": async (url) => {
      return streamwishExtractor(url);
    },
    
  };

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
    while (match = serverNameRegex.exec(html)) serverNames.push(match[1].trim());
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
      return {
        id: idx,
        name: serverNames[idx] || `server-${idx}`,
        url: url.startsWith("//") ? "https:" + url : url,
      };
    });
  }

  async function extractM3U8(servers) {
    // Run all extractors in parallel
    const extractionPromises = servers.map(async (server) => {
      const extractorKey = detectExtractor(server.url);
      let extractedSources = [];
      if (extractorKey) {
        try {
          extractedSources = await extractors[extractorKey](server.url);
          // Ensure result is always an array
          if (!Array.isArray(extractedSources)) {
            extractedSources = extractedSources ? [extractedSources] : [];
          }
        } catch (e) {
          console.error(`Extractor error for ${server.name}:`, e);
          extractedSources = [];
        }
      } else {
        // If no extractor, treat the URL as direct link
        extractedSources = [{ m3u8: server.url, quality: "HD" }];
      }
      // Map extracted sources to server objects
      return extractedSources
        .filter(source => source.m3u8)
        .map(source => ({
          ...server,
          m3u8: source.m3u8,
          quality: source.quality || "HD",
          sourceServer: source.serverName || null
        }));
    });
    // Wait for all extractions to complete
    const results = await Promise.all(extractionPromises);
    // Flatten the array of arrays into a single array
    return results.flat();
  }

  servers = await getServers(episodeUrl);
  validServers = await extractM3U8(servers);
  streamingDataList = validServers.map(server => {
    // Normalize quality to LQ/SD/HD/FHD format
    const normalizedQuality = normalizeQuality(server.quality);

    // Build name with universal format: supplier - source (quality)
    let displayName;

    // Always remove any existing quality suffix from the server name first
    let cleanName = server.name.replace(/\s*-\s*(LQ|SD|HD|FHD|144p|240p|360p|480p|720p|1080p)$/i, '').trim();

    if (server.sourceServer) {
      // Has a source server (e.g., yonaplay with 4shared/Google Drive)
      displayName = `${cleanName} - ${server.sourceServer} (${normalizedQuality})`;
    } else {
      // Direct server without sub-source
      displayName = `${cleanName} (${normalizedQuality})`;
    }

    return {
      isDub: false,
      isSub: true,
      link: server.url || "",
      m3u8Link: server.m3u8 || "",
      name: displayName,
      quality: normalizedQuality
    };
  });

  // Sort by quality: FHD > HD > SD > LQ
  const qualityOrder = { 'FHD': 0, 'HD': 1, 'SD': 2, 'LQ': 3 };
  streamingDataList.sort((a, b) => {
    const orderA = qualityOrder[a.quality] ?? 999;
    const orderB = qualityOrder[b.quality] ?? 999;
    return orderA - orderB;
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
