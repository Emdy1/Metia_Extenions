/*main streaming data episode fucntion*/
async function getEpisodeStreamData(sessionId) {
  const url = `https://animepahe.si/play/${sessionId.replace('dumb', '/')}`;
  const headers = {
    'Referer': 'https://animepahe.si/',
    'Cookie': '__ddg2_=',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };

  try {
    // Fetch the page HTML via native Dart fetch
    const res = await fetchViaNative(url, headers);

    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = res.body;

    // Parse HTML using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Extract anime title
    const animeTitleEl = doc.querySelector('h1 a[title]');
    const animeTitle = animeTitleEl ? animeTitleEl.getAttribute('title') : '';

    // Extract source buttons
    const sourceButtons = Array.from(doc.querySelectorAll('#resolutionMenu button'));
    const sources = sourceButtons.map(btn => ({
      provider: `${btn.getAttribute('data-fansub') || ''} ${btn.getAttribute('data-resolution') || ''}p`,
      link: btn.getAttribute('data-src'),
      dub: btn.getAttribute('data-audio') === 'eng',
      sub: btn.getAttribute('data-audio') === 'jpn',
      m3u8: null,
      title: animeTitle
    }));

    // Fetch m3u8 links from each source
    const m3u8Fetches = await Promise.all(
      sources.map(async source => {
        try {
          if (!source.link) return { ...source, m3u8: null };

          const res2 = await fetchViaNative(source.link, {
            'Referer': 'https://animepahe.si/',
            'User-Agent': 'Mozilla/5.0'
          });

          if (res2.status !== 200) return { ...source, m3u8: null };

          const pageHtml = res2.body;

          // Extract m3u8 via regex
          const match = pageHtml.match(/;eval(.*?)<\/script>/s);
          if (!match) return { ...source, m3u8: null };

          try {
            const wrapped = `var data = ${match[1]}; data;`;
            const result = eval(wrapped);

            const m3u8Match = result.match(/['"]([^'"]+\.m3u8)['"]/);
            return { ...source, m3u8: m3u8Match ? m3u8Match[1] : null };
          } catch (err) {
            console.log(err);
            return { ...source, m3u8: null };
          }

        } catch (err) {
          console.log(`Failed to fetch m3u8 for ${source.provider}: ${err}`);
          return { ...source, m3u8: null };
        }
      })
    );

    // Sort: dub first, sub next, highest resolution first
    m3u8Fetches.sort((a, b) => {
      if (a.dub !== b.dub) return a.dub ? -1 : 1;
      if (a.sub !== b.sub) return a.sub ? -1 : 1;
      const resA = parseInt((a.provider.match(/(\d+)p/) || [0,0])[1], 10);
      const resB = parseInt((b.provider.match(/(\d+)p/) || [0,0])[1], 10);
      return resB - resA;
    });

    return { status: 'success', data: m3u8Fetches };

  } catch (err) {
    console.log('Episode stream fetch error:', err);
    return { status: 'error', message: err.toString() };
  }
}


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

/**
 * Main wrapper to get anime episodes
 */
async function getAnimeEpisodeList(animeId) {
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
            cover: ep.snapshot || null,
            name: `Episode ${ep.episode}`,
            link: null,
            id: `${animeId}dumb${ep.session}`,
            dub: ep.audio === 'eng',
            sub: true
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

  return {
    status: 'success',
    keyword,
    data: JSON.parse(res.body).data
  };
}

