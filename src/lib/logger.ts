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

export const logger = {
  info(msg: string, data?: Record<string, any>) {
    log('info', msg, data);
  },
  warn(msg: string, data?: Record<string, any>) {
    log('warn', msg, data);
  },
  error(msg: string, error?: unknown, data?: Record<string, any>) {
    const errorData: Record<string, any> = {};
    if (error instanceof Error) {
      errorData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorData.error = error;
    }
    log('error', msg, { ...errorData, ...data });
  },
};
