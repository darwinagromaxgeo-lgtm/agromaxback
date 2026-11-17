export function bootstrapAdminSettings(environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.BOOTSTRAP_ADMIN_PASSWORD;
  if (environment.NODE_ENV === 'production' && (!configured || configured.length < 12)) {
    throw new Error('Configura BOOTSTRAP_ADMIN_PASSWORD con al menos 12 caracteres para crear el primer administrador');
  }
  return {
    username: environment.BOOTSTRAP_ADMIN_USERNAME?.trim() || 'admin',
    password: configured || 'admin123',
    email: environment.BOOTSTRAP_ADMIN_EMAIL?.trim() || 'admin@agromax.local',
  };
}
