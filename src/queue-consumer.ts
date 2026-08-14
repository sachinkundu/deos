import {
  processQueueBatch,
  type QueueBody,
  type QueueConsumerEnv,
} from "./queue-consumer-core.ts";

export default {
  queue: processQueueBatch,
} satisfies ExportedHandler<QueueConsumerEnv, QueueBody>;
