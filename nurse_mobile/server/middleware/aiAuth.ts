/**
 * AI Authentication Middleware
 *
 * Validates requests to AI endpoints have proper authorization
 */

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  
  // Public config token (accessible on server)
  const authToken = config.public.aiAuthToken as string;
  
  // Skip auth in development if token is default
  if (process.env.NODE_ENV === 'development' && authToken === 'local-dev-token') {
    return;
  }
  
  const token = getHeader(event, 'x-ai-token');

  if (token !== authToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized AI access'
    });
  }
});
