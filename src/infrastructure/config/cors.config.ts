const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
const DEPLOYED_FRONTEND_ORIGIN = 'https://agromaxgeo.netlify.app';

export function allowedCorsOrigins(environment: NodeJS.ProcessEnv = process.env): string[] {
  const configured = environment.CORS_ORIGINS
    ? environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : LOCAL_ORIGINS;

  return [...new Set([...configured, DEPLOYED_FRONTEND_ORIGIN])];
}
