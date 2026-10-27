"""Windows Recycle Bin via IFileOperation. Never fall back to file unlinking."""
import ctypes
import os
import sys
from pathlib import Path
import uuid


def recycle_files(paths):
    paths=[Path(path).absolute() for path in paths]
    if not paths:return
    for path in paths:
        if not path.is_file() or path.is_symlink():raise OSError(f"Not a regular publication file: {path.name}")

    if sys.platform!="win32":
        from send2trash import send2trash
        send2trash([str(path) for path in paths])
        if any(path.exists() for path in paths):raise OSError("Some files could not be moved to Trash")
        return

    class GUID(ctypes.Structure):
        _fields_=[("bytes",ctypes.c_ubyte*16)]
        @classmethod
        def of(cls,value):return cls.from_buffer_copy(uuid.UUID(value).bytes_le)

    def check(result):
        if result<0:raise OSError(result,f"Windows Recycle Bin operation failed (0x{result & 0xffffffff:08X})")

    def invoke(pointer,index,*types):
        table=ctypes.cast(pointer,ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        return ctypes.WINFUNCTYPE(ctypes.c_long,ctypes.c_void_p,*types)(table[index])

    ole=ctypes.WinDLL("ole32")
    shell=ctypes.WinDLL("shell32")
    ole.CoInitializeEx.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
    ole.CoInitializeEx.restype=ctypes.c_long
    initialized=ole.CoInitializeEx(None,2)
    # A GUI may already have initialized COM in another apartment model.
    if initialized<0 and initialized!=-2147417850:check(initialized)
    ole.CoCreateInstance.argtypes=[ctypes.POINTER(GUID),ctypes.c_void_p,ctypes.c_ulong,
        ctypes.POINTER(GUID),ctypes.POINTER(ctypes.c_void_p)]
    ole.CoCreateInstance.restype=ctypes.c_long
    shell.SHCreateItemFromParsingName.argtypes=[ctypes.c_wchar_p,ctypes.c_void_p,
        ctypes.POINTER(GUID),ctypes.POINTER(ctypes.c_void_p)]
    shell.SHCreateItemFromParsingName.restype=ctypes.c_long
    operation=ctypes.c_void_p();items=[]
    try:
        clsid=GUID.of("3ad05575-8857-4850-9277-11b85bdb8e09")
        iid=GUID.of("947aab5f-0a5c-4c13-b4d6-4bf7836fc9f8")
        check(ole.CoCreateInstance(ctypes.byref(clsid),None,1,ctypes.byref(iid),ctypes.byref(operation)))
        # RECYCLEONDELETE | ADDUNDORECORD | EARLYFAILURE | NOERRORUI |
        # NOCONFIRMATION | SILENT | WANTNUKEWARNING. No permanent-delete fallback.
        flags=0x00080000|0x20000000|0x00100000|0x0400|0x0010|0x0004|0x4000
        check(invoke(operation,5,ctypes.c_ulong)(operation,flags))
        shell_iid=GUID.of("43826d1e-e718-42ee-bc55-a1e261c37bfe")
        for path in paths:
            item=ctypes.c_void_p()
            check(shell.SHCreateItemFromParsingName(str(path),None,ctypes.byref(shell_iid),ctypes.byref(item)))
            items.append(item)
            check(invoke(operation,18,ctypes.c_void_p,ctypes.c_void_p)(operation,item,None))
        check(invoke(operation,21)(operation))
        aborted=ctypes.c_int()
        check(invoke(operation,22,ctypes.POINTER(ctypes.c_int))(operation,ctypes.byref(aborted)))
        if aborted.value or any(path.exists() for path in paths):
            raise OSError("Windows did not recycle every selected file.")
    finally:
        for item in items:invoke(item,2)(item)
        if operation.value:invoke(operation,2)(operation)
        if initialized>=0:ole.CoUninitialize()
