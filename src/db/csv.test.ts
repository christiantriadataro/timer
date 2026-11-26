import {test} from "node:test";
import assert from "node:assert/strict";
import {toCsv} from "./csv.ts";

test("csv quotes commas, quotes and newlines, and leaves plain values bare", () => {
    const rows = [
        {id: 1, tag: "DSA", note: null},
        {id: 2, tag: 'say "hi", ok', note: "line1\nline2"},
        {id: 3, tag: " padded ", note: undefined},
    ];
    assert.equal(toCsv(rows, ["id", "tag", "note"]),
        'id,tag,note\r\n1,DSA,\r\n2,"say ""hi"", ok","line1\nline2"\r\n3," padded ",\r\n');
});

test("csv neutralises spreadsheet formulas in text but not numbers", () => {
    const out = toCsv([{tag: "=HYPERLINK(\"x\")", n: -5}, {tag: "+1", n: 0}, {tag: "@cmd", n: 3}], ["tag", "n"]);
    assert.equal(out, 'tag,n\r\n"\'=HYPERLINK(""x"")",-5\r\n\'+1,0\r\n\'@cmd,3\r\n');
});

test("csv of no rows is just the header", () => {
    assert.equal(toCsv([] as {a: number}[], ["a"]), "a\r\n");
});
