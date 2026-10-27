"""Package launchers with Unix execute bits when building from a Windows checkout.

Extract the zip into tools/portfolio-studio in the SAME portfolio checkout.
This is a source-based launcher, not a bundled/notarized standalone executable.
"""
from pathlib import Path
import zipfile
import argparse


def package(destination):
    root=Path(__file__).resolve().parent
    files=[root/"LAUNCH_PORTFOLIO_STUDIO_MAC.command",*sorted((root/"Portfolio Studio.app").rglob("*"))]
    with zipfile.ZipFile(destination,"w",compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            if not path.is_file():continue
            name=path.relative_to(root).as_posix();info=zipfile.ZipInfo(name);info.create_system=3
            executable=path.suffix==".command" or path.name=="PortfolioStudio"
            info.external_attr=((0o100755 if executable else 0o100644)<<16)
            archive.writestr(info,path.read_bytes(),compress_type=zipfile.ZIP_DEFLATED)
    return Path(destination)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("destination",type=Path)
    print(package(parser.parse_args().destination))
