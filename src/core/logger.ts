type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;
const RESERVED_FIELDS = new Set(['level', 'time', 'component', 'message']);

function renameReservedFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      RESERVED_FIELDS.has(key) ? `detail_${key}` : key,
      value
    ])
  );
}

function normalizeDetails(details?: unknown): LogFields {
  if (!details) return {};
  if (details instanceof Error) {
    return {
      error: {
        name: details.name,
        message: details.message,
        stack: process.env.NODE_ENV === 'development' ? details.stack : undefined
      }
    };
  }
  if (typeof details === 'object') return renameReservedFields(details as LogFields);
  return { details };
}

function write(level: LogLevel, component: string, message: string, details?: unknown) {
  const payload = {
    ...normalizeDetails(details),
    level,
    time: new Date().toISOString(),
    component,
    message
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

function scoped(component: string) {
  return {
    info: (message: string, details?: unknown) => write('info', component, message, details),
    warn: (message: string, details?: unknown) => write('warn', component, message, details),
    error: (message: string, details?: unknown) => write('error', component, message, details)
  };
}

const logger = {
  info: (component: string, message: string, details?: unknown) => write('info', component, message, details),
  warn: (component: string, message: string, details?: unknown) => write('warn', component, message, details),
  error: (component: string, message: string, details?: unknown) => write('error', component, message, details),
  scoped
};

export = logger;
