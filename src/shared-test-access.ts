import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {sha256Hex} from './implementation-hash.ts';

export interface TestAccessConfig {
  teamDomain:string;
  audience:string;
  allowedEmail:string;
  serviceClientId:string;
}

export interface TestAccessPrincipal {
  kind:'human'|'service';
  principalSha256:string;
}

/** Verify the Access application JWT, then bind a session to its exact subject. */
export async function verifyTestAccess(token:string|null,config:TestAccessConfig,
  providedKeys?:JWTVerifyGetKey):Promise<TestAccessPrincipal> {
  if (!token || token.length>16_000) throw new Error('test_access_unauthorized');
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(config.teamDomain) ||
      !/^[a-f0-9]{64}$/i.test(config.audience) ||
      !config.allowedEmail || !config.serviceClientId)
    throw new Error('test_access_configuration_invalid');
  const issuer=`https://${config.teamDomain}`;
  const keys=providedKeys??createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const {payload}=await jwtVerify(token,keys,{issuer,audience:config.audience,
    algorithms:['RS256']});
  if (payload.type!=='app') throw new Error('test_access_subject_forbidden');
  if (typeof payload.common_name==='string') {
    if (payload.common_name!==config.serviceClientId || payload.sub!=='')
      throw new Error('test_access_service_forbidden');
    return {kind:'service',principalSha256:await sha256Hex(
      `service:${payload.common_name}`)};
  }
  if (typeof payload.email!=='string' || !payload.email ||
      payload.email.toLowerCase()!==config.allowedEmail.toLowerCase() ||
      typeof payload.sub!=='string' || !payload.sub)
    throw new Error('test_access_human_forbidden');
  return {kind:'human',principalSha256:await sha256Hex(
    `human:${payload.email.toLowerCase()}:${payload.sub}`)};
}
