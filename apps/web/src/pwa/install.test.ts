import { describe, expect, it } from "vitest";
import { detectPlatform, isSnoozed, snooze, SNOOZE_DAYS } from "./install.ts";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

describe("instalação do app", () => {
  it("reconhece cada aparelho", () => {
    expect(detectPlatform(UA.iphoneSafari)).toBe("ios-safari");
    expect(detectPlatform(UA.iphoneChrome)).toBe("ios-other");
    expect(detectPlatform(UA.android)).toBe("android");
    expect(detectPlatform(UA.windows)).toBe("desktop");
  });

  it("iPad com iPadOS se apresenta como Mac, mas tem toque", () => {
    expect(detectPlatform(UA.ipadOs, 5)).toBe("ios-safari");
    expect(detectPlatform(UA.ipadOs, 0)).toBe("desktop");
  });

  it("'Agora não' adia por 14 dias", () => {
    const now = Date.UTC(2026, 9, 12);
    expect(isSnoozed(now)).toBe(false);
    snooze(now);
    expect(isSnoozed(now + (SNOOZE_DAYS - 1) * 86_400_000)).toBe(true);
    expect(isSnoozed(now + (SNOOZE_DAYS + 1) * 86_400_000)).toBe(false);
  });
});
