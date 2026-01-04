/* main streaming data episode function */
async function getEpisodeStreamData(sessionId) {
  const url = `https://animepahe.si/play/${sessionId.replace('dumb', '/')}`;
  const headers = {
    Referer: 'https://animepahe.si/',
    Cookie: '__ddg2_=',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };

  try {
    const res = await fetchViaNative(url, headers);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);

    const html = res.body;

    /* ----------------------------
     * 1. Extract anime title
     * <h1><a title="Anime Name">
     * ---------------------------- */
    let animeTitle = '';
    const titleMatch = html.match(
      /<h1[^>]*>\s*<a[^>]*title=["']([^"']+)["']/i
    );
    if (titleMatch) animeTitle = titleMatch[1];

    /* ---------------------------------------
     * 2. Extract resolution/source buttons
     * <button data-src="..."
     *         data-resolution="720"
     *         data-audio="jpn"
     *         data-fansub="HorribleSubs">
     * --------------------------------------- */
    const sources = [];
    const buttonRegex =
      /<button[^>]*data-src=["']([^"']+)["'][^>]*>/gi;

    let btnMatch;
    while ((btnMatch = buttonRegex.exec(html)) !== null) {
      const buttonHtml = btnMatch[0];

      const getAttr = (name) => {
        const m = buttonHtml.match(
          new RegExp(`${name}=["']([^"']+)["']`, 'i')
        );
        return m ? m[1] : null;
      };

      const src = getAttr('data-src');
      const reso = getAttr('data-resolution');
      const audio = getAttr('data-audio');
      const fansub = getAttr('data-fansub');

      sources.push({
        name: `${fansub || ''} ${reso || ''}p`.trim(),
        link: src,
        isDub: audio === 'eng',
        isSub: audio === 'jpn',
        m3u8Link: null,
        animeTitle
      });
    }

    /* ---------------------------------------
     * 3. Fetch each source & extract m3u8
     * --------------------------------------- */
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          if (!source.link) return source;

          const res2 = await fetchViaNative(source.link, {
            Referer: 'https://animepahe.si/',
            'User-Agent': 'Mozilla/5.0'
          });

          if (res2.status !== 200) return source;

          const pageHtml = res2.body;

          // Extract eval-packed script
          const evalMatch = pageHtml.match(/;eval\((.*?)\)\s*<\/script>/s);
          if (!evalMatch) return source;

          try {
            const unpacked = eval(`(${evalMatch[1]})`);
            const m3u8Match = unpacked.match(/https?:\/\/[^'"]+\.m3u8/);

            return {
              ...source,
              m3u8Link: m3u8Match ? m3u8Match[0] : null
            };
          } catch (e) {
            console.log('Eval failed:', e);
            return source;
          }

        } catch (e) {
          console.log('Source fetch failed:', e);
          return source;
        }
      })
    );

    /* ---------------------------------------
     * 4. Sort: dub > sub > resolution
     * --------------------------------------- */
    results.sort((a, b) => {
      if (a.isDub !== b.isDub) return a.isDub ? -1 : 1;
      if (a.isSub !== b.isSub) return a.isSub ? -1 : 1;

      const ra = parseInt(a.name.match(/(\d+)p/)?.[1] || 0, 10);
      const rb = parseInt(b.name.match(/(\d+)p/)?.[1] || 0, 10);
      return rb - ra;
    });

    return { status: 'success', data: results };

  } catch (err) {
    console.log('Episode stream fetch error:', err);
    return { status: 'error', message: String(err) };
  }
}
/* Main wrapper to get anime episodes*/
async function getAnimeEpisodeList(animeId) {
  async function fetchAllEpisodesParallel(animeId, headers = {}) {
    const firstPageUrl = `https://animepahe.si/api?m=release&id=${animeId}&sort=episode_asc&page=1`;

    try {
      const firstRes = await fetchViaNative(firstPageUrl, headers);
      if (firstRes.status !== 200) throw new Error(`HTTP ${firstRes.status}`);

      const firstData = JSON.parse(firstRes.body);
      const totalPages = firstData.last_page || 1;
      const accumulated = firstData.data || [];

      if (totalPages <= 1) return accumulated;

      const fetchPromises = [];
      for (let page = 2; page <= totalPages; page++) {
        const url = `https://animepahe.si/api?m=release&id=${animeId}&sort=episode_asc&page=${page}`;
        fetchPromises.push(
          fetchViaNative(url, headers)
            .then(res => {
              if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
              return JSON.parse(res.body).data || [];
            })
            .catch(err => {
              console.error(`Failed to fetch page ${page}:`, err);
              return []; // continue even if one page fails
            })
        );
      }

      const remainingEpisodes = await Promise.all(fetchPromises);
      return accumulated.concat(...remainingEpisodes);
    } catch (err) {
      console.error('Error fetching episodes:', err);
      throw err;
    }
  }
  const headers = {
    'Cookie': '__ddg2_=',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json,text/html,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
  };

  try {
    const allEpisodes = await fetchAllEpisodesParallel(animeId, headers);

    const transformed = allEpisodes.map(ep => ({
      poster: ep.snapshot || null,
      name: `Episode ${ep.episode}`,
      url: `${animeId}dumb${ep.session}`,
      // id: `${animeId}dumb${ep.session}`,
      isDub: ep.audio === 'eng',
      isSub: true
    }));

    return { status: 'success', animeId, data: transformed };
  } catch (err) {
    console.error('Episode list error:', err);
    return { status: 'error', message: err.toString(), animeId };
  }
}
/*main Search function*/
async function searchAnime(keyword) {
  console.log("Searching for anime:", keyword);

  const url = `https://animepahe.si/api?m=search&q=${encodeURIComponent(keyword)}`;

  const res = await fetchViaNative(url, {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'Cookie': '__ddg2_=; _ga=GA1.2.123456789.1234567890; _gid=GA1.2.123456789.1234567890'
  });

  if (res.status !== 200) {
    throw new Error("HTTP " + res.status);
  }


  results2 = [];
  JSON.parse(res.body).data.map(item => {
    results2.push({
      name: item.title,
      length: item.episodes,
      poster: item.poster,
      url: item.session,
    });
  });

  return {
    status: 'success',
    keyword,
    data: results2
  };
}
