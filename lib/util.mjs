import pkg from 'winston'
const { createLogger, format, transports } = pkg
const { combine, label, json } = format

export const createLog = (category) => {
  return createLogger({
    level: 'info',
    format: combine(label({ label: category }), json()),
    transports: [
      new transports.Console(),
      // new winston.transports.File({ filename: 'server.log' }),
    ],
  })
}

export const ensureArray = (ary) => {
  return Array.isArray(ary) ? ary : [ary]
}
