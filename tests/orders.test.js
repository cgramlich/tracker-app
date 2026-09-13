/* Orders: what is on its way, and what never showed up.
   The value of this feature is noticing ABSENCE, so the tests care most about the
   two alarms (late, and gone quiet with no date) firing when they should and NOT
   firing when they should not. A false alarm is the failure that would teach
   Chris to stop looking at the screen. */
const { build, liftConst, is, section, report } = require("./lift");

const TODAY = "2026-09-13";
const O = build([
  "ORDER_STATUSES", "ORDER_STALE_DAYS", "ORDER_SOON_DAYS", "ISO_DATE",
  "isRealISODate", "daysBetweenISO", "cleanOrder", "normalizeExtractedOrders",
  "orderState", "ORDER_BUCKET_RANK", "ordersByUrgency", "ordersSummary", "orderWhenLabel",
], `
  const DEFAULT_SPACE = "personal";
  let _n = 0; function uid(){ return "o" + (++_n); }
  function nowISO(){ return "${TODAY}T12:00:00.000Z"; }
  function todayKey(d){ const x = new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
  function TODAY(){ return "${TODAY}"; }
  function fmtDate(s){ return "[" + s + "]"; }
`);

const order = (o) => Object.assign({ id: "x", merchant: "Store", item: "Thing", orderedAt: "2026-09-01",
  expectedBy: "", cost: "", ref: "", note: "", status: "ordered", arrivedAt: "", space: "personal" }, o);
const bucket = (o) => O.orderState(order(o), TODAY).bucket;

section("dates");
is("a real date passes", O.isRealISODate("2026-09-13"), true);
is("the right shape but not a real day fails", O.isRealISODate("2026-13-45"), false);
is("Feb 30 fails", O.isRealISODate("2026-02-30"), false);
is("free text fails", O.isRealISODate("Thursday"), false);
is("empty fails", O.isRealISODate(""), false);

section("cleanOrder");
is("nothing to recognise it by is not an order", O.cleanOrder({ merchant: " ", item: "" }), null);
is("a store alone is enough", O.cleanOrder({ merchant: "Amazon" }).merchant, "Amazon");
is("an item alone is enough", O.cleanOrder({ item: "Desk" }).item, "Desk");
is("a missing order date becomes today", O.cleanOrder({ item: "Desk" }).orderedAt, TODAY);
is("an impossible expected date is dropped, not kept", O.cleanOrder({ item: "Desk", expectedBy: "2026-02-30" }).expectedBy, "");
is("an unknown status falls back to on the way", O.cleanOrder({ item: "Desk", status: "shipped" }).status, "ordered");
is("marking arrived stamps the day", O.cleanOrder({ item: "Desk", status: "arrived" }).arrivedAt, TODAY);
is("an existing arrived date is kept", O.cleanOrder({ item: "Desk", status: "arrived", arrivedAt: "2026-09-10" }).arrivedAt, "2026-09-10");
is("arrivedAt is cleared if it is not arrived", O.cleanOrder({ item: "Desk", status: "ordered", arrivedAt: "2026-09-10" }).arrivedAt, "");

section("the model's reading is validated before anyone sees it");
const read = O.normalizeExtractedOrders([
  { merchant: "Amazon", item: "USB cable", orderedAt: "2026-09-10", expectedBy: "2026-09-16", cost: "$9.99", ref: "112-7" },
  { merchant: "", item: "" },                                                   // nothing
  "not an object",
  { merchant: "Etsy", item: "Mug", orderedAt: "2026-12-25", expectedBy: "" },   // ordered in the future
  { merchant: "REI", item: "Tent", orderedAt: "2026-09-10", expectedBy: "2026-09-02" }, // arrives before ordered
  { merchant: "Shop", item: "x".repeat(300) },
], TODAY);
is("junk entries are dropped", read.length, 4);
is("a good reading passes through intact", [read[0].merchant, read[0].expectedBy, read[0].cost, read[0].ref],
  ["Amazon", "2026-09-16", "$9.99", "112-7"]);
is("an order dated in the future is pulled back to today", read[1].orderedAt, TODAY);
is("a delivery date before the order date is dropped, so it cannot raise a false late", read[2].expectedBy, "");
is("a runaway item name is shortened", read[3].item.length <= 140, true);
is("everything read starts as on the way", read.every(o => o.status === "ordered"), true);
is("a non-array reading is safe", O.normalizeExtractedOrders({ oops: true }, TODAY), []);

section("late: past the expected date and not arrived");
is("one day past is late", bucket({ expectedBy: "2026-09-12" }), "late");
is("due TODAY is not late - the day is not over", bucket({ expectedBy: TODAY }), "soon");
is("arrived is never late, however old", bucket({ expectedBy: "2026-08-01", status: "arrived" }), "closed");
is("sorted is never late", bucket({ expectedBy: "2026-08-01", status: "resolved" }), "closed");
is("days late is counted", O.orderState(order({ expectedBy: "2026-09-07" }), TODAY).days, 6);

section("gone quiet: no delivery date, and nothing for a while");
is("ordered 21 days ago with no date is flagged", bucket({ orderedAt: "2026-08-23" }), "stale");
is("ordered 20 days ago with no date is not yet", bucket({ orderedAt: "2026-08-24" }), "undated");
is("an expected date suppresses the quiet alarm - lateness is judged by the date instead",
  bucket({ orderedAt: "2026-07-01", expectedBy: "2026-09-20" }), "upcoming");

section("other states");
is("a flagged problem stays open", bucket({ status: "problem" }), "problem");
is("due within 3 days is soon", bucket({ expectedBy: "2026-09-16" }), "soon");
is("due in 4 days is upcoming", bucket({ expectedBy: "2026-09-17" }), "upcoming");

section("urgency order");
const ranked = O.ordersByUrgency([
  order({ id: "up", expectedBy: "2026-09-25" }),
  order({ id: "late2", expectedBy: "2026-09-11" }),
  order({ id: "done", status: "arrived" }),
  order({ id: "soon", expectedBy: "2026-09-14" }),
  order({ id: "quiet", orderedAt: "2026-08-01" }),
  order({ id: "late9", expectedBy: "2026-09-04" }),
  order({ id: "prob", status: "problem" }),
  order({ id: "new", orderedAt: "2026-09-12" }),
], TODAY).map(r => r.o.id);
is("late (worst first), quiet, problem, soon, upcoming, undated, then closed",
  ranked, ["late9", "late2", "quiet", "prob", "soon", "up", "new", "done"]);

section("summary drives the Dashboard line");
const sum = O.ordersSummary([
  order({ expectedBy: "2026-09-10" }), order({ orderedAt: "2026-08-01" }), order({ status: "problem" }),
  order({ expectedBy: "2026-09-20" }), order({ status: "arrived" }),
], TODAY);
is("needs a look = late + quiet + problem", sum.needsLook, 3);
is("open excludes arrived", sum.open, 4);
is("nothing at all is safe", O.ordersSummary(null, TODAY).needsLook, 0);

section("labels read as plain English");
const label = (o) => O.orderWhenLabel(order(o), O.orderState(order(o), TODAY));
is("late, singular", label({ expectedBy: "2026-09-12" }), "Late 1 day");
is("late, plural", label({ expectedBy: "2026-09-10" }), "Late 3 days");
is("quiet", label({ orderedAt: "2026-08-20" }), "No date, ordered 24 days ago");
is("due today", label({ expectedBy: TODAY }), "Due today");
is("due tomorrow", label({ expectedBy: "2026-09-14" }), "Due tomorrow");
is("arrived shows when", label({ status: "arrived", arrivedAt: "2026-09-10" }), "Arrived [2026-09-10]");

section("the reading instructions keep the rules that stop false alarms");
const prompt = liftConst("ORDER_EXTRACT_SYSTEM");
is("a delivery RANGE resolves to its latest date", /LATEST date/.test(prompt), true);
is("the model is told never to invent a date, price or order number", /Never invent/.test(prompt), true);
is("relative dates are resolved against a supplied TODAY", /against TODAY/.test(prompt), true);
is("it asks for JSON only", /ONLY a JSON array/.test(prompt), true);

report();
