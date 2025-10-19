using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text.RegularExpressions;

namespace DocumentRedlining;

public static class TrackedChangesEditor
{
    private const string AuthorName = "AI reviewer";

    public static void EnableRevisionTracking(string filePath)
    {
        using var wordDoc = WordprocessingDocument.Open(filePath, true);
        var documentSettingsPart = wordDoc.MainDocumentPart.DocumentSettingsPart
            ?? wordDoc.MainDocumentPart.AddNewPart<DocumentSettingsPart>();
        documentSettingsPart.Settings ??= new Settings();

        if (documentSettingsPart.Settings.Descendants<TrackRevisions>().FirstOrDefault() == null)
        {
            documentSettingsPart.Settings.AppendChild(new TrackRevisions());
        }

        documentSettingsPart.Settings.Save();
    }

    public static void DeleteTextWithRedline(string filePath, string textToDelete)
    {
        using var wordDoc = WordprocessingDocument.Open(filePath, true);
        var body = wordDoc.MainDocumentPart.Document.Body;
        var paragraphs = body.Descendants<Paragraph>().ToList();

        foreach (var paragraph in paragraphs)
        {
            var combinedText = paragraph.InnerText;
            if (!combinedText.Contains(textToDelete, StringComparison.Ordinal))
            {
                continue;
            }

            var match = Regex.Match(combinedText, Regex.Escape(textToDelete));
            if (!match.Success)
            {
                continue;
            }

            var startIndex = match.Index;
            var endIndex = match.Index + match.Length;
            var charCount = 0;

            var runsInParagraph = paragraph.Descendants<Run>().ToList();

            foreach (var run in runsInParagraph)
            {
                var runTextElement = run.GetFirstChild<Text>();
                if (runTextElement is null)
                {
                    continue;
                }

                var runLength = runTextElement.Text.Length;
                var isPartiallyDeleted = charCount < endIndex && charCount + runLength > startIndex;

                if (isPartiallyDeleted)
                {
                    var runText = runTextElement.Text;
                    var startRunIndex = Math.Max(0, startIndex - charCount);
                    var endRunIndex = Math.Min(runLength, endIndex - charCount);

                    if (startRunIndex > 0)
                    {
                        var precedingRun = (Run)run.CloneNode(true);
                        precedingRun.GetFirstChild<Text>()!.Text = runText[..startRunIndex];
                        paragraph.InsertBefore(precedingRun, run);
                    }

                    var deletedRun = (Run)run.CloneNode(true);
                    deletedRun.RemoveAllChildren<Text>();
                    deletedRun.AppendChild(new DeletedText(runText[startRunIndex..endRunIndex]));

                    var deletedRunWrapper = new DeletedRun(deletedRun)
                    {
                        Author = AuthorName,
                        Date = DateTime.Now,
                    };
                    paragraph.InsertBefore(deletedRunWrapper, run);

                    if (endRunIndex < runLength)
                    {
                        var followingRun = (Run)run.CloneNode(true);
                        followingRun.GetFirstChild<Text>()!.Text = runText[endRunIndex..];
                        paragraph.InsertBefore(followingRun, run);
                    }

                    run.Remove();
                }

                charCount += runLength;
            }
        }
    }

    public static void InsertTextWithRedline(string filePath, string anchorText, string textToInsert)
    {
        using var wordDoc = WordprocessingDocument.Open(filePath, true);
        var body = wordDoc.MainDocumentPart.Document.Body;

        foreach (var paragraph in body.Descendants<Paragraph>())
        {
            var paragraphText = paragraph.InnerText;
            if (!paragraphText.Contains(anchorText, StringComparison.Ordinal))
            {
                continue;
            }

            var match = Regex.Match(paragraphText, Regex.Escape(anchorText));
            if (!match.Success)
            {
                continue;
            }

            var charCount = 0;
            var runsInParagraph = paragraph.Descendants<Run>().ToList();

            foreach (var run in runsInParagraph)
            {
                var runTextElement = run.GetFirstChild<Text>();
                if (runTextElement is null)
                {
                    continue;
                }

                var runLength = runTextElement.Text.Length;
                var anchorEndWithinRun = charCount < match.Index + match.Length &&
                                         charCount + runLength >= match.Index + match.Length;

                if (!anchorEndWithinRun)
                {
                    charCount += runLength;
                    continue;
                }

                var runText = runTextElement.Text;
                var insertIndex = match.Index + match.Length - charCount;

                var insertedRun = new Run();
                var runProperties = new RunProperties
                {
                    Color = new Color { Val = "FF0000" },
                };
                runProperties.AppendChild(new Underline { Val = UnderlineValues.Single });
                insertedRun.Append(runProperties);
                insertedRun.Append(new Text(textToInsert));

                var insertedRunWrapper = new InsertedRun(insertedRun)
                {
                    Author = AuthorName,
                    Date = DateTime.Now,
                };

                var precedingRun = (Run)run.CloneNode(true);
                precedingRun.GetFirstChild<Text>()!.Text = runText[..insertIndex];

                var followingRun = (Run)run.CloneNode(true);
                followingRun.GetFirstChild<Text>()!.Text = runText[insertIndex..];

                paragraph.InsertBefore(precedingRun, run);
                paragraph.InsertBefore(insertedRunWrapper, run);
                paragraph.InsertBefore(followingRun, run);
                run.Remove();
                break;
            }
        }
    }
}
