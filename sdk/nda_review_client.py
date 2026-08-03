"""
NDA Review API — Python client

One dependency: `requests` (pip install requests). Drop this file into your
own project and import it, or copy the two methods into your existing
HTTP client setup.

Usage:
    from nda_review_client import NdaReviewClient

    client = NdaReviewClient(base_url="https://your-deployment.vercel.app")

    key_info = client.generate_key()
    api_key = key_info["key"]  # store this somewhere safe — shown once

    result = client.review(
        docx_path="./some-nda.docx",
        api_key=api_key,
        rules=[
            {
                "label": "Perpetual term",
                "matchType": "regex",
                "pattern": "perpetual|indefinitely",
                "matchWhen": "present",
                "severity": "critical",
                "action": "flag",
                "enabled": True,
            }
        ],
    )
    print(result["findings"], result["lintWarnings"])

    with open("redlined.docx", "wb") as f:
        import base64
        f.write(base64.b64decode(result["redlinedDocxBase64"]))
"""

import base64
import requests


class NdaReviewClient:
    def __init__(self, base_url):
        if not base_url:
            raise ValueError("NdaReviewClient requires base_url")
        self.base_url = base_url.rstrip("/")

    def generate_key(self):
        """Generate a new API key. No authentication required for this call.

        Returns: {"key": str, "issuedAt": int}
        """
        resp = requests.post(f"{self.base_url}/api/generate-key")
        data = resp.json()
        if not resp.ok:
            raise RuntimeError(data.get("error", f"Request failed with status {resp.status_code}"))
        return data

    def review(self, api_key, rules, docx_path=None, docx_base64=None):
        """Run a review. Provide either docx_path (a local file) or docx_base64.

        Returns: {"findings": [...], "lintWarnings": [...], "redlinedDocxBase64": str}
        """
        if not api_key:
            raise ValueError("review() requires api_key")
        if not isinstance(rules, list):
            raise ValueError("review() requires rules as a list")
        if not docx_path and not docx_base64:
            raise ValueError("review() requires either docx_path or docx_base64")

        if docx_base64 is None:
            with open(docx_path, "rb") as f:
                docx_base64 = base64.b64encode(f.read()).decode("ascii")

        resp = requests.post(
            f"{self.base_url}/api/review",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"docxBase64": docx_base64, "rules": rules},
        )
        data = resp.json()
        if not resp.ok:
            raise RuntimeError(data.get("error", f"Request failed with status {resp.status_code}"))
        return data

    def review_and_save(self, api_key, rules, output_path, docx_path=None, docx_base64=None):
        """Convenience: run a review and write the redlined .docx straight to disk."""
        result = self.review(api_key=api_key, rules=rules, docx_path=docx_path, docx_base64=docx_base64)
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(result["redlinedDocxBase64"]))
        return result
