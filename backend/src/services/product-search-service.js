'use strict';

const { HttpError } = require('../utils/http-error');

function createProductSearchService(config, fetchImpl = globalThis.fetch) {
  let cachedToken = '';
  let tokenExpiresAt = 0;

  async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 30000) return cachedToken;
    const credentials = Buffer.from(`${config.ebayClientId}:${config.ebayClientSecret}`).toString('base64');
    let response;
    try {
      response = await fetchImpl('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'https://api.ebay.com/oauth/api_scope'
        }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new HttpError('Product search timed out while connecting to eBay.', 504, 'PRODUCT_SEARCH_TIMEOUT');
      }
      throw new HttpError('Product search could not connect to eBay.', 502, 'PRODUCT_SEARCH_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new HttpError('eBay could not authorize product search. Check its API credentials.', 502, 'PRODUCT_SEARCH_AUTH_FAILED');
    }
    const token = await response.json();
    if (typeof token.access_token !== 'string' || !Number.isFinite(Number(token.expires_in))) {
      throw new HttpError('eBay returned an invalid authorization response.', 502, 'PRODUCT_SEARCH_AUTH_FAILED');
    }
    cachedToken = token.access_token;
    tokenExpiresAt = Date.now() + Number(token.expires_in) * 1000;
    return cachedToken;
  }

  return {
    async search(query) {
      const q = typeof query === 'string' ? query.trim() : '';
      if (!q || q.length > 100) {
        throw new HttpError('Enter a search term between 1 and 100 characters.', 400, 'INVALID_SEARCH_QUERY');
      }
      if (!config.ebayClientId || !config.ebayClientSecret) {
        throw new HttpError('Product search is not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in your local .env file.', 503, 'PRODUCT_SEARCH_NOT_CONFIGURED');
      }

      const token = await getAccessToken();
      const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
      url.searchParams.set('q', q);
      url.searchParams.set('limit', '10');
      let response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': config.ebayMarketplaceId
          },
          signal: AbortSignal.timeout(10000)
        });
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new HttpError('Product search timed out. Please try again.', 504, 'PRODUCT_SEARCH_TIMEOUT');
        }
        throw new HttpError('Product search could not connect to eBay.', 502, 'PRODUCT_SEARCH_UNAVAILABLE');
      }
      if (response.status === 429) {
        throw new HttpError('eBay product search is temporarily rate-limited. Try again later.', 503, 'PRODUCT_SEARCH_QUOTA');
      }
      if (!response.ok) {
        throw new HttpError('eBay product search failed. Check marketplace settings and API access.', 502, 'PRODUCT_SEARCH_UPSTREAM_ERROR');
      }

      const result = await response.json();
      const items = Array.isArray(result.itemSummaries) ? result.itemSummaries : [];
      return items.map((item) => ({
        title: typeof item.title === 'string' ? item.title : '',
        price: item.price && Number.isFinite(Number(item.price.value))
          ? { value: Number(item.price.value), currency: String(item.price.currency || '') }
          : null,
        imageUrl: typeof item.image?.imageUrl === 'string' ? item.image.imageUrl : null,
        url: typeof item.itemWebUrl === 'string' ? item.itemWebUrl : null,
        condition: typeof item.condition === 'string' ? item.condition : null,
        seller: typeof item.seller?.username === 'string' ? item.seller.username : null
      })).filter((item) => item.title && item.url);
    }
  };
}

module.exports = { createProductSearchService };
