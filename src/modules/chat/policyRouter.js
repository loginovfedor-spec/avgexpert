const { getProvider } = require('../providers/provider.factory');

class PolicyRouter {
  /**
   * Resolves the primary route and routing policies based on category settings.
   * 
   * @param {Object} categorySettings - The configuration for the user's category
   * @returns {Object} Route resolution object containing the provider instance and policy details
   */
  resolveRoute(categorySettings) {
    if (!categorySettings) {
      categorySettings = {};
    }

    const providerId = categorySettings.provider || 'llamacpp';
    const mode = categorySettings.routing_mode || 'direct';
    const fallbackProviderId = categorySettings.fallback_provider || null;

    const provider = getProvider(providerId);

    if (!provider) {
      const err = new Error(`Провайдер "${providerId}" не найден`);
      err.status = 502;
      throw err;
    }

    return {
      providerId,
      provider,
      mode,
      fallbackProviderId,
      // Pass along the endpoint_url for SSRF checks
      endpointUrl: categorySettings.endpoint_url || null
    };
  }
}

module.exports = new PolicyRouter();
