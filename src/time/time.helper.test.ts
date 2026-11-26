import {test} from "node:test";
import assert from "node:assert/strict";
import {remainingSeconds} from "./time.helper.ts";

test("remainingSeconds rounds up and never goes negative", () => {
    const end = 1_000_000;
    assert.equal(remainingSeconds(end, end - 1500 * 1000), 1500);
    assert.equal(remainingSeconds(end, end - 1), 1);
    assert.equal(remainingSeconds(end, end - 999), 1);
    assert.equal(remainingSeconds(end, end - 1001), 2);
    assert.equal(remainingSeconds(end, end), 0);
    assert.equal(remainingSeconds(end, end + 60_000), 0);
});
