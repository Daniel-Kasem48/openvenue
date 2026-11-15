export const APP_CONFIG = Symbol('APP_CONFIG');
export interface AppConfig {
  databaseUrl: string;
  adminPassword: string;
  secureCookies: boolean;
  publicOrigin?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
}
