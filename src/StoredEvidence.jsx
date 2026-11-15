import { useEffect, useState } from "react";
import { readEvidence } from "./evidence-store.js";
export default function StoredEvidence({ file, children }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let disposed = false,
      created = null;
    setUrl(null);
    if (file?.storageId)
      readEvidence(file.storageId)
        .then((record) => {
          if (record && !disposed) {
            created = URL.createObjectURL(record.blob);
            setUrl(created);
          }
        })
        .catch(() => {});
    return () => {
      disposed = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [file?.storageId]);
  return children(url);
}
