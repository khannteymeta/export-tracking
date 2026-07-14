type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, extra?: Record<string, any>) {
  const logObj = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...extra,
  };
  console.log(JSON.stringify(logObj));
}

export function info(msg: string, data?: Record<string, any>) {
  log('info', msg, data);
}

export function warn(msg: string, data?: Record<string, any>) {
  log('warn', msg, data);
}

export function error(msg: string, err?: unknown, data?: Record<string, any>) {
  const errorData: Record<string, any> = {};
  if (err instanceof Error) {
    errorData.error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  } else if (err !== undefined) {
    errorData.error = err;
  }
  log('error', msg, { ...errorData, ...data });
}

export const logger = {
  info,
  warn,
  error,
};

