/** Tongyang guardian characters prepared from the user-provided reference captures. */
export default function BrandCharacters({
  focus = "group",
  className = "",
  label = "",
}) {
  return (
    <span
      className={`brand-characters ${focus === "group" ? "cast-group" : `cast-character cast-${focus}`} ${className}`}
      data-character={focus === "guide" ? "gelodi" : "guardian-family"}
      aria-hidden={label ? undefined : true}
    >
      <img
        src={
          focus === "guide"
            ? "/brand/tongyang-gelodi.png"
            : "/brand/tongyang-family.png"
        }
        alt={label}
        draggable="false"
        decoding="async"
      />
    </span>
  );
}
