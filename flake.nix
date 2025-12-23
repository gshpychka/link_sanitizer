{
  description = "Development shell flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    {
      nixpkgs,
      systems,
      ...
    }:
    let
      forEachSystem = nixpkgs.lib.genAttrs (import systems);
    in
    {
      devShells = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          isDarwin = pkgs.stdenv.hostPlatform.isDarwin;
          home = "$PRJ_ROOT/.home";
        in
        {
          default = pkgs.mkShell {
            buildInputs =
              with pkgs;
              [
                git
                awscli2
                nodejs_24
                nodePackages.pnpm
                typescript
              ]
              ++ [
                (pkgs.writeShellScriptBin "assume" "HOME=${home} source ${pkgs.granted}/bin/assume")
                (pkgs.writeShellScriptBin "granted" "HOME=${home} ${pkgs.granted}/bin/granted $@")
                (pkgs.writeShellScriptBin "cdk" "${pkgs.nodejs_24}/bin/npx --no cdk -- $@")
              ];
            shellHook = ''
              export AWS_PROFILE=main
              export DOCKER_DEFAULT_PLATFORM=linux/amd64
              export PRJ_ROOT=$(pwd)
              ${
                if
                  isDarwin
                # https://stackoverflow.com/a/75317155/10418515
                then
                  "export BUILDX_NO_DEFAULT_ATTESTATIONS=1"
                else
                  ""
              }
              export AWS_CONFIG_FILE=${home}/.aws/config
              echo "Link sanitizer loaded"
            '';
          };
        }
      );
    };
}
