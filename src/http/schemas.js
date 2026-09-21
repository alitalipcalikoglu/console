/** JSON Schemas for the console's own API. */
export class Schemas {
  static email = { type: 'string', format: 'email', maxLength: 254 };
  static password = { type: 'string', minLength: 1, maxLength: 1024 };
  static code = { type: 'string', pattern: '^[0-9]{6}$' };
  static uuid = { type: 'string', format: 'uuid' };
  static id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_.:-]+$' };
  static sid = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 40 };

  /** @param {string[]} required @param {Record<string, object>} properties */
  static body(required, properties) {
    return { type: 'object', additionalProperties: false, required, properties };
  }

  static login = Schemas.body(['email', 'password'], { email: Schemas.email, password: Schemas.password });
  static totp = Schemas.body(['code'], { code: Schemas.code });
  static changePassword = Schemas.body(['currentPassword', 'newPassword'], { currentPassword: Schemas.password, newPassword: Schemas.password });
  static disableTotp = Schemas.body(['password', 'code'], { password: Schemas.password, code: Schemas.code });
  static createAdmin = Schemas.body(['email', 'password', 'role'], { email: Schemas.email, password: Schemas.password, name: { type: 'string', maxLength: 80 }, role: { type: 'string', enum: ['admin', 'viewer'] } });
  static patchAdmin = { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, role: { type: 'string', enum: ['admin', 'viewer'] }, status: { type: 'string', enum: ['active', 'disabled'] } } };
  static setPassword = Schemas.body(['password'], { password: Schemas.password });
  static serviceParams = { type: 'object', properties: { sid: Schemas.sid }, required: ['sid'] };
  static serviceIdParams = { type: 'object', properties: { sid: Schemas.sid, id: Schemas.id }, required: ['sid', 'id'] };
  static serviceIdSubParams = { type: 'object', properties: { sid: Schemas.sid, id: Schemas.id, sub: Schemas.id }, required: ['sid', 'id', 'sub'] };
  static auditQuery = {
    type: 'object', additionalProperties: false,
    properties: {
      source: { type: 'string', maxLength: 64 }, action: { type: 'string', maxLength: 120 }, actionPrefix: { type: 'string', maxLength: 120 },
      outcome: { type: 'string', enum: ['success', 'failure', 'denied'] }, actorType: { type: 'string', maxLength: 32 }, actorId: { type: 'string', maxLength: 128 },
      targetType: { type: 'string', maxLength: 32 }, targetId: { type: 'string', maxLength: 128 }, ip: { type: 'string', maxLength: 45 }, requestId: { type: 'string', maxLength: 128 },
      from: { type: 'string', maxLength: 40 }, to: { type: 'string', maxLength: 40 },
      limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|1[0-9][0-9]|200)$' }, cursor: { type: 'string', maxLength: 200 },
      format: { type: 'string', enum: ['ndjson', 'csv'] }, hours: { type: 'string', pattern: '^[0-9]{1,3}$' }, fromSeq: { type: 'string', pattern: '^[0-9]{1,16}$' }, toSeq: { type: 'string', pattern: '^[0-9]{1,16}$' },
    },
  };
  static shortlinkQuery = {
    type: 'object', additionalProperties: false,
    properties: {
      q: { type: 'string', maxLength: 200 }, tag: { type: 'string', maxLength: 40 }, status: { type: 'string', enum: ['active', 'disabled', 'expired', 'exhausted'] },
      createdBy: { type: 'string', maxLength: 64 }, limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|1[0-9][0-9]|200)$' }, cursor: { type: 'string', maxLength: 200 },
      days: { type: 'string', pattern: '^[0-9]{1,3}$' }, scale: { type: 'string', pattern: '^[0-9]{1,2}$' }, margin: { type: 'string', pattern: '^[0-8]$' },
    },
  };
  static shortlinkBody = {
    url: { type: 'string', minLength: 8, maxLength: 8192 }, slug: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$' }, permanent: { type: 'boolean' }, enabled: { type: 'boolean' },
    expiresAt: { type: 'string', maxLength: 40, nullable: true }, maxClicks: { type: 'integer', minimum: 1, maximum: 1000000000, nullable: true },
    tags: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 40 } }, note: { type: 'string', maxLength: 500, nullable: true },
  };
  static schedulerQuery = {
    type: 'object', additionalProperties: false,
    properties: {
      q: { type: 'string', maxLength: 120 }, tag: { type: 'string', maxLength: 40 }, enabled: { type: 'string', enum: ['true', 'false'] },
      status: { type: 'string', enum: ['pending', 'running', 'retrying', 'succeeded', 'failed', 'skipped', 'cancelled'] }, job: { type: 'string', maxLength: 80 },
      limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|1[0-9][0-9]|200)$' }, cursor: { type: 'string', maxLength: 80 }, before: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' },
      cron: { type: 'string', maxLength: 100 }, timezone: { type: 'string', maxLength: 64 }, count: { type: 'string', pattern: '^([1-9]|[1-4][0-9]|50)$' },
    },
  };
  static schedulerFields = {
    description: { type: 'string', maxLength: 500 }, tags: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 40 } }, enabled: { type: 'boolean' },
    schedule: { type: 'object', additionalProperties: false, properties: { cron: { type: 'string', minLength: 1, maxLength: 100 }, timezone: { type: 'string', minLength: 1, maxLength: 64 }, at: { type: 'string', minLength: 20, maxLength: 40 } } },
    target: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string', minLength: 8, maxLength: 2048 }, method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }, headers: { type: 'object', maxProperties: 10, additionalProperties: { type: 'string', maxLength: 1024 }, propertyNames: { maxLength: 64 } }, body: {} } },
    targetKey: { type: ['string', 'null'], maxLength: 64 }, timeoutMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
    retry: { type: 'object', additionalProperties: false, properties: { max: { type: 'integer', minimum: 0, maximum: 1000 }, backoffSec: { type: 'integer', minimum: 1, maximum: 86400 } } },
  };
  static schedulerCreate = Schemas.body(['name', 'schedule', 'target'], { name: { type: 'string', pattern: '^[a-z0-9]+([.\\-_][a-z0-9]+)*$', maxLength: 80 }, ...Schemas.schedulerFields });
  static schedulerPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: Schemas.schedulerFields };
  static webhookQuery = {
    type: 'object', additionalProperties: false,
    properties: {
      q: { type: 'string', maxLength: 120 }, status: { type: 'string', enum: ['active', 'paused', 'disabled', 'pending', 'running', 'retrying', 'succeeded', 'failed', 'cancelled'] },
      event: { type: 'string', maxLength: 120 }, type: { type: 'string', maxLength: 120 }, subscription: { type: 'string', pattern: '^sub_[0-9a-f]{16}$' },
      limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|1[0-9][0-9]|200)$' }, cursor: { type: 'string', maxLength: 80 }, before: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' },
    },
  };
  static webhookFields = {
    name: { type: 'string', pattern: '^[a-z0-9]+([.\\-_][a-z0-9]+)*$', maxLength: 80 }, url: { type: 'string', minLength: 8, maxLength: 2048 },
    events: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 120 } }, description: { type: 'string', maxLength: 500 },
    headers: { type: 'object', maxProperties: 10, additionalProperties: { type: 'string', maxLength: 1024 }, propertyNames: { maxLength: 64 } }, enabled: { type: 'boolean' },
  };
  static webhookCreate = Schemas.body(['name', 'url', 'events'], Schemas.webhookFields);
  static webhookPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: Schemas.webhookFields };
  static webhookReplay = Schemas.body(['from'], { from: { type: 'string', minLength: 20, maxLength: 40 }, to: { type: 'string', minLength: 20, maxLength: 40 } });
  static searchName = { type: 'string', pattern: '^[a-z0-9]+([.\\-_][a-z0-9]+)*$', maxLength: 80 };
  static searchIndexFields = { description: { type: 'string', maxLength: 500 }, weights: { type: 'object', additionalProperties: false, properties: { title: { type: 'number' }, body: { type: 'number' }, tags: { type: 'number' } } }, facets: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 64 } } };
  static searchIndexCreate = Schemas.body(['name'], { name: Schemas.searchName, ...Schemas.searchIndexFields });
  static searchIndexPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: Schemas.searchIndexFields };
  static searchQuery = { type: 'object', additionalProperties: false, properties: { limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|100)$' }, offset: { type: 'string', pattern: '^(0|[1-9][0-9]{0,4})$' } } };
  static searchBody = Schemas.body([], { q: { type: 'string', maxLength: 500 }, filters: { type: 'object', maxProperties: 20, additionalProperties: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 200 } } }, facets: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 64 } }, limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0, maximum: 10000 }, highlight: { type: 'boolean' }, sort: { type: 'string', enum: ['relevance', 'newest', 'oldest'] } });
  static searchUpsert = Schemas.body(['documents'], { documents: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', required: ['id', 'title'], additionalProperties: false, properties: { id: { type: 'string', minLength: 1, maxLength: 200 }, title: { type: 'string' }, body: { type: 'string' }, tags: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 100 } }, attrs: { type: 'object' }, url: { type: 'string', maxLength: 2048 } } } } });
  static rlName = { type: 'string', pattern: '^[a-z0-9]+([.\\-_][a-z0-9]+)*$', maxLength: 80 };
  static rlSubject = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^\\u0000-\\u001f\\u007f]+$' };
  static rlLimits = { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['window', 'limit'], properties: { window: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 0 } } } };
  static rlPolicyCreate = Schemas.body(['name', 'limits'], { name: Schemas.rlName, description: { type: 'string', maxLength: 500 }, limits: Schemas.rlLimits });
  static rlPolicyPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: { description: { type: 'string', maxLength: 500 }, limits: Schemas.rlLimits } };
  static rlOverride = Schemas.body(['limits'], { limits: Schemas.rlLimits, note: { type: 'string', maxLength: 500 }, expiresAt: { type: ['string', 'null'], maxLength: 40 } });
  static rlCheck = Schemas.body(['policy', 'subject'], { policy: Schemas.rlName, subject: Schemas.rlSubject, cost: { type: 'integer', minimum: 0, maximum: 1000000 }, peek: { type: 'boolean' } });
  static rlStatsQuery = { type: 'object', additionalProperties: false, properties: { hours: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|[1-6][0-9][0-9]|7[0-1][0-9]|720)$' } } };
  static rlTopQuery = { type: 'object', additionalProperties: false, properties: { window: { type: 'string', pattern: '^[1-9][0-9]{0,7}$' }, limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|100)$' } } };
  static geoLang = { type: 'string', minLength: 2, maxLength: 35, pattern: '^[A-Za-z0-9-]+$' };
  static geoIpQuery = { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string', minLength: 2, maxLength: 64 }, lang: Schemas.geoLang } };
  static geoIpBatch = Schemas.body(['ips'], { ips: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string', minLength: 2, maxLength: 64 } }, lang: Schemas.geoLang });
  static geoCountriesQuery = { type: 'object', additionalProperties: false, properties: { q: { type: 'string', maxLength: 100 }, continent: { type: 'string', pattern: '^[A-Za-z]{2}$' }, eu: { type: 'string', enum: ['true', 'false'] }, currency: { type: 'string', pattern: '^[A-Za-z]{3}$' }, lang: Schemas.geoLang } };
  static geoTimezonesQuery = { type: 'object', additionalProperties: false, properties: { country: { type: 'string', minLength: 2, maxLength: 3 }, q: { type: 'string', maxLength: 100 }, lang: Schemas.geoLang } };
  static geoPhoneQuery = { type: 'object', additionalProperties: false, required: ['number'], properties: { number: { type: 'string', minLength: 1, maxLength: 40 }, country: { type: 'string', minLength: 2, maxLength: 3 } } };
  static geoPair = { type: 'string', pattern: '^\\s*-?\\d{1,3}(\\.\\d+)?\\s*,\\s*-?\\d{1,3}(\\.\\d+)?\\s*$' };
  static geoDistanceQuery = { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: Schemas.geoPair, to: Schemas.geoPair } };
  static geoCollectionCreate = Schemas.body(['name'], { name: Schemas.rlName, description: { type: 'string', maxLength: 500 } });
  static geoCollectionPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: { description: { type: 'string', maxLength: 500 } } };
  static geoPlaces = Schemas.body(['places'], { places: { type: 'array', minItems: 1, maxItems: 5000, items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'lat', 'lng'], properties: { id: { type: 'string', minLength: 1, maxLength: 200 }, name: { type: 'string', maxLength: 200 }, lat: { type: 'number' }, lng: { type: 'number' }, attrs: { type: 'object', maxProperties: 50 } } } } });
  static geoNearbyQuery = { type: 'object', additionalProperties: false, required: ['lat', 'lng'], properties: { lat: { type: 'string', pattern: '^-?\\d{1,3}(\\.\\d+)?$' }, lng: { type: 'string', pattern: '^-?\\d{1,3}(\\.\\d+)?$' }, radius: { type: 'string', pattern: '^\\d{1,5}(\\.\\d+)?$' }, limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|100)$' } } };
  static flagsQuery = {
    type: 'object', additionalProperties: false,
    properties: {
      q: { type: 'string', maxLength: 120 }, tag: { type: 'string', maxLength: 40 }, kind: { type: 'string', enum: ['boolean', 'string', 'number', 'json'] }, archived: { type: 'string', enum: ['true', 'false'] },
      limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|1[0-9][0-9]|200)$' }, cursor: { type: 'string', maxLength: 80 }, before: { type: 'string', pattern: '^[0-9]{1,15}$' },
    },
  };
  static flagsEnv = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,31}$' };
  static flagsCreate = Schemas.body(['key', 'kind'], { key: { type: 'string', pattern: '^[a-z0-9]+([.\\-_][a-z0-9]+)*$', maxLength: 80 }, kind: { type: 'string', enum: ['boolean', 'string', 'number', 'json'] }, description: { type: 'string', maxLength: 500 }, tags: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 40 } }, value: {}, offValue: {}, enabled: { type: 'boolean' } });
  static flagsPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: { description: { type: 'string', maxLength: 500 }, tags: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 40 } }, archived: { type: 'boolean' }, reshuffle: { type: 'boolean' } } };
  static flagsEnvPatch = { type: 'object', additionalProperties: false, minProperties: 1, properties: { enabled: { type: 'boolean' }, value: {}, offValue: {}, percentage: { type: 'integer', minimum: 0, maximum: 100 }, rules: { type: 'array', maxItems: 100 } } };
  static flagsEvaluate = Schemas.body(['env'], { env: Schemas.flagsEnv, context: { type: 'object', additionalProperties: false, properties: { userId: { type: 'string', maxLength: 128 }, email: { type: 'string', maxLength: 254 }, attrs: { type: 'object', maxProperties: 32, additionalProperties: { type: 'string', maxLength: 128 } } } }, keys: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 80 } } });
  static paging = { type: 'object', additionalProperties: true, properties: { limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|100)$' }, cursor: { type: 'string', maxLength: 200 }, status: { type: 'string', maxLength: 20 }, email: { type: 'string', maxLength: 254 }, before: { type: 'string', maxLength: 30 }, action: { type: 'string', maxLength: 60 } } };
}
