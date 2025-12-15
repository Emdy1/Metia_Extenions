async function searchAnime(keyword) {
    const headers = {
        'Cookie': '__ddg2_=',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    };

    const url = `https://animepahe.si/api?m=search&q=${encodeURIComponent(keyword)}`;

    try {
        const response = await xhr(url, headers);
        const searchResults = response.data;

        return JSON.stringify({
            status: 'success',
            keyword: keyword,
            data: searchResults
        })
    } catch (error) {

        sendMessage('log', JSON.stringify({
            status: 'error',
            message: 'Failed to search anime',
            error: error.message
        }));
    }
}