# NDA Review API — client SDKs & integration files

Four ways to integrate the API into your own systems, depending on your stack.
All four were tested against a real running instance of the API before being
included here — not just written and assumed to work.

## 1. Node.js — `nda-review-client.js`
Zero dependencies (uses Node 18+'s built-in `fetch`). Copy the file into your
project:
```js
const { NdaReviewClient } = require('./nda-review-client');
const client = new NdaReviewClient({ baseUrl: 'https://your-deployment.vercel.app' });

const { key } = await client.generateKey();
const result = await client.reviewAndSave({
  docxPath: './some-nda.docx',
  apiKey: key,
  rules: [ /* your rules */ ],
  outputPath: './redlined.docx'
});
console.log(result.findings, result.lintWarnings);
```

## 2. Python — `nda_review_client.py`
One dependency: `pip install requests`.
```python
from nda_review_client import NdaReviewClient

client = NdaReviewClient(base_url="https://your-deployment.vercel.app")
key_info = client.generate_key()
result = client.review_and_save(
    api_key=key_info["key"], rules=[...], docx_path="./some-nda.docx",
    output_path="./redlined.docx"
)
print(result["findings"], result["lintWarnings"])
```

## 3. OpenAPI spec — `openapi.yaml`
For teams who want to generate a client in a language other than JS/Python
(Java, Go, C#, etc.) — most codegen tools (`openapi-generator`, Swagger
Codegen) can produce a full typed client from this spec automatically. Also
directly importable into Postman, Insomnia, or similar API clients.

## 4. Postman collection — `nda-review-api.postman_collection.json`
For testing or exploring the API without writing any code. Import into
Postman, set the `baseUrl` collection variable to your deployment, run
"Generate API Key" (it automatically saves the key to the `apiKey` variable),
then set `docxBase64` and run "Review NDA".

## Before any of these work
The API needs to actually be deployed with `API_SIGNING_SECRET` set — see
`../api/README.md` for that setup. None of these SDKs create or manage a
deployment; they're clients for one that already exists.
