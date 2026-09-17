# Geo from the console

**Geo** page (one per configured `geo` service): four stats (IP database loaded or not with type and build date, lookups since start split into found / not found, collections, places) and two columns of tools. Viewers use every lookup; admins manage collections and reload the database.

**IP lookup**: type an address; the result shows the classification badge (public, private, loopback …), whether the database has it, then country (with an EU badge), registered country when different, region, city and postal code, coordinates with a copy button and the accuracy radius, time zone, ASN, the matched network and the source database. The address is kept in the URL (`?ip=`) so a lookup can be shared. Special ranges are answered without a database.

**Phone**: a number and an optional default country (for numbers typed without a country code). Shows the E.164 form with a copy button, the valid badge or the reason, the country with other candidates when a calling code is shared, and the national part.

**Distance**: two `lat, lng` points; shows km, miles and the bearing.

**IP database**: type, build date (absolute and relative), file and size, languages, ASN database, load time. **Reload** (admin) re-reads the files after an update on the host; a failed reload keeps the previous data and shows the error here. Without `MMDB_PATH` the panel says so; everything except IP lookup still works.

**Collections** lists place collections with counts. **Create collection** (app bar) asks for a name (permanent) and a description. **Reference** (app bar) opens the tables.

## Reference

Three tabs: countries (flag, localized name, EU badge, the three codes, continent, calling codes, currency, primary time zones), currencies (code, name, symbol, decimals, countries) and time zones (name and long name, current offset and abbreviation, local time, DST state, countries). The search box filters by name or code with accents and Turkish i folded; the language box (BCP 47) changes the names. Tab, search and language live in the URL.

## The collection page

**Nearby** takes latitude, longitude and a radius in km and lists the closest places with distance and bearing. Clicking a place in the table uses it as the centre.

**Places** shows every place (name, id, coordinates, attributes as badges) with paging. Per row (admin): **Delete place** (confirmation).

Actions in the app bar: **Upload places** (a JSON array of `{ id, name, lat, lng, attrs? }` or an object with a `places` array; the dialog says how many rows it parsed; same ids update, one bad row rejects the whole upload), **Edit** (description), and under ⋯: **Clear collection** (typed confirmation) and **Delete collection** (typed confirmation).

## Recorded in the console log

`geo.database.reload`, `geo.collection.create`, `geo.collection.update` (the patch), `geo.collection.clear` (removed count), `geo.collection.delete`, `geo.places.upsert` (count), `geo.place.delete` (collection in meta).
