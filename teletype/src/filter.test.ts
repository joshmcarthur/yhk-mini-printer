import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldPrint } from "./filter.js";
import type { MeshtasticTextMessage } from "./meshtastic.js";

function baseMessage(
  overrides: Partial<MeshtasticTextMessage> = {},
): MeshtasticTextMessage {
  return {
    id: 1,
    channel: 0,
    from: 2130636288,
    to: 4294967295,
    type: "text",
    payload: { text: "Hello mesh" },
    sender: "!7efeee00",
    timestamp: 1752041880,
    ...overrides,
  };
}

describe("shouldPrint", () => {
  it("accepts primary channel broadcast text", () => {
    const result = shouldPrint(baseMessage());
    assert.deepEqual(result, { kind: "CH0", body: "Hello mesh" });
  });

  it("accepts DM text", () => {
    const result = shouldPrint(
      baseMessage({ to: 1234567890, channel: 0 }),
    );
    assert.deepEqual(result, { kind: "DM", body: "Hello mesh" });
  });

  it("accepts DM on non-primary channel", () => {
    const result = shouldPrint(
      baseMessage({ to: 1234567890, channel: 2 }),
    );
    assert.deepEqual(result, { kind: "DM", body: "Hello mesh" });
  });

  it("rejects secondary channel broadcast", () => {
    assert.equal(shouldPrint(baseMessage({ channel: 2 })), null);
  });

  it("rejects non-text types", () => {
    assert.equal(
      shouldPrint(
        baseMessage({
          type: "nodeinfo",
          payload: { longname: "base0" },
        }),
      ),
      null,
    );
  });

  it("rejects empty body", () => {
    assert.equal(shouldPrint(baseMessage({ payload: { text: "   " } })), null);
  });

  it("accepts string payload", () => {
    const result = shouldPrint(
      baseMessage({ payload: "Plain text over MQTT" }),
    );
    assert.deepEqual(result, {
      kind: "CH0",
      body: "Plain text over MQTT",
    });
  });

  it("treats broadcast to -1 as primary channel", () => {
    const result = shouldPrint(baseMessage({ to: -1 }));
    assert.deepEqual(result?.kind, "CH0");
  });
});
