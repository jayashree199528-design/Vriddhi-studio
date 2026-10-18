import unittest

from server import create_slides


class SlideBuilderTests(unittest.TestCase):
    def test_fixed_seven_slide_sequence_and_explicit_formula(self):
        lesson = create_slides({
            "topic": "Accounting equation",
            "program": "B.Com",
            "branch": "Finance",
            "subject": "Financial Accounting",
            "module": "Unit 1",
            "source": (
                "CONCEPT:\nThe accounting equation relates assets, liabilities and equity.\n\n"
                "FORMULA:\nAssets = Liabilities + Equity\n\n"
                "WORKED EXAMPLE:\nAssets are 100 and liabilities are 40, so equity is 60.\n\n"
                "TRICK:\nKeep both sides in balance."
            ),
        })
        self.assertEqual(len(lesson), 7)
        self.assertEqual(lesson[0]["title"], "Accounting equation")
        self.assertEqual(lesson[0]["kicker"], "B.Com · Finance")
        self.assertEqual(lesson[3]["body"], "Assets = Liabilities + Equity")
        self.assertIn("equity is 60", lesson[4]["body"])
        self.assertEqual(lesson[5]["body"], "Keep both sides in balance.")

    def test_missing_formula_is_flagged_not_invented(self):
        lesson = create_slides({
            "topic": "Simple topic",
            "program": "B.Sc",
            "source": "CONCEPT:\nA source concept with enough words to meet the minimum content size.",
        })
        self.assertIn("No formula", lesson[3]["body"])
        self.assertEqual(lesson[2]["steps"], [])


if __name__ == "__main__":
    unittest.main()
