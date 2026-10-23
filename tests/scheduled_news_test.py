import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("local_brief", Path(__file__).parents[1] / "scripts/news/local_brief.py")
local_brief = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_brief)


class SourceEvidenceTests(unittest.TestCase):
    def test_sentence_split_preserves_us_abbreviation(self):
        self.assertEqual(local_brief.sentences("A company reviews its U.S. listing. It has not set a date."), ["A company reviews its U.S. listing.", "It has not set a date."])

    def test_supported_summary_has_exact_source_evidence(self):
        body = "The company said its business outlook remained unchanged while it reviewed financing options. Another company expanded production in a separate region."
        self.assertEqual(local_brief.evidence_for("The company's business outlook remained unchanged.", body), body.split(". ")[0] + ".")

    def test_unsupported_numbers_and_low_overlap_stop_generation(self):
        body = "The company said its business outlook remained unchanged while it reviewed financing options."
        with self.assertRaises(ValueError):
            local_brief.evidence_for("The company said its business outlook remained unchanged with 999 factories.", body)
        with self.assertRaises(ValueError):
            local_brief.evidence_for("Scientists discovered a planet near another galaxy.", body)


if __name__ == "__main__":
    unittest.main()
