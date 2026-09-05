# Prepare the captured figures for the page.
#
#   python docs/crop_figures.py
#
# A full-page screenshot of a long page is the right capture and the wrong
# figure. Some of these pages are five or seven thousand pixels tall; placed
# whole on an A4 page they would be scaled to a width at which the text cannot
# be read. So the figures are cut down here rather than by hand, for the same
# reason they are captured by a script rather than by hand: a figure in the
# dissertation must be reproducible from the repository, and a crop made in an
# image editor is not.
#
# Two operations, both deterministic:
#
#   trim   remove trailing rows that are entirely page background. Every
#          capture ends with whitespace below the last card; none of it says
#          anything.
#   region take an explicit band of the page, for the three captures whose
#          argument sits in one part of a much longer page. The bands are
#          stated below with the reason for each, so that a reader can check
#          the crop against the original, which stays in the repository.
#
# Nothing is scaled, nothing is recomposed and nothing is retouched. Output
# goes to docs/screenshots/print/ and the originals are left alone.

import os
import sys

try:
    from PIL import Image
except ImportError:                                        # pragma: no cover
    sys.exit("Pillow is needed: python -m pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "screenshots")
OUT = os.path.join(SRC, "print")

# Bands are given in source pixels. The captures are taken at device scale 2,
# so a y of 2700 is 1350 CSS pixels down the page.
REGIONS = {
    # The verdict, the dimensions it covers and the elements that produced it.
    # Below this band the remaining element groups are all unchecked.
    "08-console-rejects-zeng.png": (0, 2700),
    "09-console-accepts-balanced.png": (0, 2700),
}

# Two figures out of one capture, because the page carries two separate tables
# and each is cited separately in Chapter 5.
SPLITS = {
    "10-model-reference.png": [
        ("10a-suitability-matrix.png", 2320, 4600),
        ("10b-traceability.png", 4600, 7050),
    ],
}


def background(image):
    """The page background, taken from the last row of the capture."""
    row = image.crop((0, image.height - 1, image.width, image.height))
    colours = row.getcolors(image.width) or []
    return max(colours)[1] if colours else None


def trim(image):
    """Drop trailing rows that are entirely background."""
    bg = background(image)
    if bg is None:
        return image
    y = image.height
    while y > 1:
        row = image.crop((0, y - 1, image.width, y))
        colours = row.getcolors(2)
        if colours is None or colours[0][1] != bg:
            break
        y -= 1
    return image.crop((0, 0, image.width, min(image.height, y + 24)))


def main():
    if not os.path.isdir(SRC):
        sys.exit("No captures in %s. Run docs/screenshots.mjs first." % SRC)
    os.makedirs(OUT, exist_ok=True)

    written = 0
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".png"):
            continue
        image = Image.open(os.path.join(SRC, name))

        if name in SPLITS:
            for out_name, top, bottom in SPLITS[name]:
                piece = trim(image.crop((0, top, image.width, min(bottom, image.height))))
                piece.save(os.path.join(OUT, out_name))
                print("  %-34s %dx%d" % (out_name, piece.width, piece.height))
                written += 1
            continue

        if name in REGIONS:
            top, bottom = REGIONS[name]
            image = image.crop((0, top, image.width, min(bottom, image.height)))

        image = trim(image)
        image.save(os.path.join(OUT, name))
        print("  %-34s %dx%d" % (name, image.width, image.height))
        written += 1

    print("\n%d figures written to %s" % (written, OUT))
    print("Originals are unchanged; the crop is reproducible from them.")


if __name__ == "__main__":
    main()
