import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_BLOCKS } from "@yhk/shared/print-document";
import { formatTeletypeSlip, SEPARATOR } from "./format.js";
import type { MeshtasticTextMessage } from "./meshtastic.js";

function baseMessage(
  overrides: Partial<MeshtasticTextMessage> = {},
): MeshtasticTextMessage {
  return {
    id: 452664778,
    channel: 0,
    from: 2130636288,
    to: 4294967295,
    type: "text",
    payload: { text: "Anyone copy on LongFast?" },
    sender: "!7efeee00",
    timestamp: 1752041880,
    ...overrides,
  };
}

function blockTexts(blocks: ReturnType<typeof formatTeletypeSlip>): string[] {
  return blocks
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text);
}

describe("formatTeletypeSlip", () => {
  it("formats primary channel slip per mockup", () => {
    const blocks = formatTeletypeSlip(
      baseMessage(),
      "CH0",
      "Anyone copy on LongFast?",
    );
    const texts = blockTexts(blocks);

    assert.equal(texts[0], SEPARATOR);
    assert.equal(texts[1], "CH0");
    assert.equal(texts[2], "from !7efeee00");
    assert.match(texts[3] ?? "", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(texts[4], SEPARATOR);
    assert.equal(texts[5], "Anyone copy on LongFast?");
    assert.equal(texts.at(-1), SEPARATOR);
  });

  it("formats DM kind line", () => {
    const blocks = formatTeletypeSlip(baseMessage(), "DM", "Meet at trailhead");
    assert.equal(blockTexts(blocks)[1], "DM");
  });

  it("omits timestamp line when missing", () => {
    const blocks = formatTeletypeSlip(
      baseMessage({ timestamp: undefined }),
      "CH0",
      "No clock",
    );
    const texts = blockTexts(blocks);

    assert.equal(texts[1], "CH0");
    assert.equal(texts[2], "from !7efeee00");
    assert.equal(texts[3], SEPARATOR);
    assert.equal(texts[4], "No clock");
  });

  it("uses derived node id when sender missing", () => {
    const blocks = formatTeletypeSlip(
      baseMessage({ sender: undefined }),
      "CH0",
      "Hi",
    );
    assert.equal(blockTexts(blocks)[2], "from !7efeee00");
  });

  it("splits body on newlines into separate blocks", () => {
    const blocks = formatTeletypeSlip(baseMessage(), "CH0", "Line one\nLine two");
    const bodyBlocks = blocks.filter(
      (block) => block.type === "text" && block.font === "normal",
    );
    const bodyTexts = bodyBlocks
      .filter((block) => block.type === "text")
      .map((block) => block.text);
    assert.deepEqual(bodyTexts, ["Line one", "Line two"]);
  });

  it("stays within MAX_BLOCKS for long bodies", () => {
    const paragraphs = Array.from({ length: 40 }, (_, index) => `para ${index}`);
    const blocks = formatTeletypeSlip(
      baseMessage(),
      "CH0",
      paragraphs.join("\n"),
    );
    assert(blocks.length <= MAX_BLOCKS);
    assert.equal(blockTexts(blocks).at(-2), "…");
  });
});
