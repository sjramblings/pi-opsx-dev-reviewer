# XML parser, vendored

<!-- vale Vale.Spelling = NO -->

The SVG safety verifier parses untrusted renderer output. It uses a vendored, hash-pinned parser so
the parse behaviour cannot drift under a lockfile update or a transitive republish.

## Contents

| Package | Version | License |
| --- | --- | --- |
| [saxes](https://github.com/lddubeau/saxes) | 6.0.0 | ISC |
| [xmlchars](https://github.com/lddubeau/xmlchars) | 2.2.0 | MIT |

Only the runtime files the verifier loads are vendored. Type definitions, source maps, READMEs, and
tests are omitted deliberately.

## Integrity

Every file below is recorded in `tools/structurizr/pin.json` under `xmlParser.files` and is checked
by `bun test tools/structurizr-verify.test.ts` before any SVG is parsed:

- `node_modules/saxes/saxes.js`
- `node_modules/saxes/package.json`
- `node_modules/xmlchars/package.json`
- `node_modules/xmlchars/LICENSE`
- `node_modules/xmlchars/xml/1.0/ed5.js`
- `node_modules/xmlchars/xml/1.1/ed2.js`
- `node_modules/xmlchars/xmlns/1.0/ed3.js`

The two source tarballs are pinned by SHA-256 and npm integrity in the same pin file. Both were
re-downloaded and reproduced byte-for-byte when this directory was created.

## Updating

Do not edit these files. To move the parser version: update `xmlParser` in the pin, re-download both
tarballs, reproduce every hash, re-run the SVG safety corpus on both native targets, and record the
result in `tools/structurizr/pin-evidence.md` in a reviewed pull request.

## Parser configuration

The verifier constructs the parser namespace-aware and non-recovering, with DTDs rejected and entity
expansion limited to the five XML built-ins. That configuration is itself pinned under
`xmlParser.configuration` and asserted by the tests, so a permissive reconfiguration fails the gate
rather than silently widening what counts as safe.
