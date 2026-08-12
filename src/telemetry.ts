export type TelemetryAttribute = string | number | boolean;

export interface OTelEventRecord {
  Timestamp: string;
  ObservedTimestamp: string;
  SeverityNumber: number;
  SeverityText: string;
  Body: string;
  EventName: string;
  Resource: { "service.name": string };
  Attributes: Record<string, TelemetryAttribute>;
}

export interface TelemetryEventOptions {
  serviceName: string;
  correlationId: string;
  timestamp?: Date;
  attributes?: Record<string, TelemetryAttribute>;
  severityNumber?: number;
  severityText?: string;
}

export type TelemetryEmitter = (name: string, options: TelemetryEventOptions) => void;

export const createTelemetryEvent = (
  name: string,
  options: TelemetryEventOptions,
): OTelEventRecord => {
  const timestamp = (options.timestamp ?? new Date()).toISOString();
  return {
    Timestamp: timestamp,
    ObservedTimestamp: timestamp,
    SeverityNumber: options.severityNumber ?? 9,
    SeverityText: options.severityText ?? "INFO",
    Body: name,
    EventName: name,
    Resource: { "service.name": options.serviceName },
    Attributes: {
      "deos.correlation.id": options.correlationId,
      ...options.attributes,
    },
  };
};

export const emitTelemetryEvent: TelemetryEmitter = (name, options) => {
  const record = JSON.stringify(createTelemetryEvent(name, options));
  if ((options.severityNumber ?? 9) >= 17) {
    console.error(record);
  } else if ((options.severityNumber ?? 9) >= 13) {
    console.warn(record);
  } else {
    console.log(record);
  }
};
