# Searching from the console

**Search** page (one per configured `search` service): every index with its document count, facet keys, last indexing time and searches served since the service started. Viewers search; admins manage.

**Create index** asks for a name (permanent), description, the three field weights (title / body / tags, used by BM25 ranking) and the facet keys the search page offers as filter groups.

## The index page

A search box (words, `"exact phrase"`, `-excluded`; the last word matches as a prefix) and a sort selector. Results arrive as you type (250 ms debounce, stale responses discarded) and show the highlighted title, a highlighted body snippet, the id, tags and attributes, and the BM25 score. The query as the service ran it appears in the panel header.

**Filters** on the left (stacked above the results on phones) list the index's facet keys with the values and counts found in the current result set; tick values to narrow (OR within a key, AND across keys). Query, sort and filters live in the URL, so a search can be shared or refreshed. A ticked value that no longer occurs in the results stays listed with a count of 0 so it can be unticked.

Clicking a result opens the document: id with copy button, URL, tags, attributes, body, source key and time. **Delete** removes it from the index (confirmation; the source system may re-add it).

Actions in the app bar: **Edit** (description, weights, facet keys; only changed fields are sent), and under ⋯: **Clear index** (typed confirmation; documents removed, definition kept) and **Delete index** (typed confirmation).

## Recorded in the console log

`search.index.create`, `search.index.update` (the patch), `search.index.clear` (removed count), `search.index.delete`, `search.documents.upsert` (count), `search.document.delete` (index in meta).
