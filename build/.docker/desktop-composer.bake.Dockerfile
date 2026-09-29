# ==============================================================================
# MODULE DOCKERFILE
# This file is not meant to be built standalone. It is consumed by the 
# docker-bake.hcl file in this monorepo.
# ==============================================================================

# Bundled editor plugins (AI, Plugin Manager, ...) from ONLYOFFICE's plugin
# repo, pinned to a commit. The desktop app loads system plugins from
# editors/sdkjs-plugins/{GUID}/, and their pages reference the plugin API at
# https://onlyoffice.github.io/sdkjs-plugins/v1/, which is rewritten to the
# bundled local v1/ copy so plugins work offline.
# SDKJS_PLUGINS entries are names under sdkjs-plugins/content/ or repo paths.
FROM ubuntu:24.04 AS sdkjs-plugins
    ARG SDKJS_PLUGINS_REPO
    ARG SDKJS_PLUGINS_REF
    ARG SDKJS_PLUGINS

    RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && \
        rm -rf /var/lib/apt/lists/*

    RUN <<'EOF'
set -eu
paths="sdkjs-plugins/v1"
for p in $SDKJS_PLUGINS; do
    case "$p" in */*) paths="$paths $p" ;; *) paths="$paths sdkjs-plugins/content/$p" ;; esac
done

mkdir -p /src /out
cd /src
git init -q
git remote add origin "$SDKJS_PLUGINS_REPO"
git config remote.origin.promisor true
git config remote.origin.partialclonefilter blob:none
git sparse-checkout set --no-cone $(for x in $paths; do printf '/%s/ ' "$x"; done)
git fetch -q --depth 1 --filter=blob:none origin "$SDKJS_PLUGINS_REF"
git checkout -q FETCH_HEAD

cp -r sdkjs-plugins/v1 /out/v1
for x in $paths; do
    [ "$x" = "sdkjs-plugins/v1" ] && continue
    [ -f "$x/config.json" ] || { echo "plugin not found: $x" >&2; exit 1; }
    guid=$(grep -o 'asc\.{[^}]*}' "$x/config.json" | head -n1 | sed 's/^asc\.//')
    [ -n "$guid" ] || { echo "no guid in $x/config.json" >&2; exit 1; }
    cp -r "$x" "/out/$guid"
    echo "plugin: $x -> $guid"
done

cd /out
find . -mindepth 2 -name '*.html' | while read -r f; do
    depth=$(printf '%s' "${f#./}" | tr -cd '/' | wc -c)
    prefix=$(printf '../%.0s' $(seq 1 "$depth"))
    sed -i "s#https://onlyoffice.github.io/sdkjs-plugins/#${prefix}#g" "$f"
done
EOF

FROM scratch AS desktop-common
    ARG BUILD_ROOT

    COPY --from=sdkjs-desktop ${BUILD_ROOT} /editors/
    COPY --from=web-apps ${BUILD_ROOT} /editors/

    COPY --from=desktop-js /app/loginpage/deploy/index.html /index.html
    COPY --from=desktop-js /app/loginpage/deploy/noconnect.html /editors/webext/noconnect.html

    COPY web-apps/apps/api/documents/index.html.desktop /editors/web-apps/apps/api/documents/index.html
    
    COPY desktop-apps/common/converter/* /converter/
    # Support only Nextcloud for now
    COPY desktop-apps/common/loginpage/providers/nextcloud /providers/nextcloud
    COPY desktop-apps/common/templates /converter/templates

    COPY desktop-sdk/ChromiumBasedEditors/resources/ /editors/sdkjs/common/Images/

    COPY build/configs/core/DoctRenderer.config.desktop /converter/DoctRenderer.config
    
    COPY document-templates/new /converter/empty

    COPY dictionaries/ /dictionaries
    

    COPY core-fonts/opensans   /fonts
    COPY core-fonts/asana      /fonts/asana
    COPY core-fonts/caladea    /fonts/caladea
    COPY core-fonts/crosextra  /fonts/crosextra
    COPY core-fonts/openoffice /fonts/openoffice
    COPY core-fonts/ASC.ttf    /fonts/ASC.ttf

    COPY --from=sdkjs-plugins /out/ /editors/sdkjs-plugins/
