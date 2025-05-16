{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    pkgs.nodePackages.aws-cdk
    pkgs.nodePackages.pnpm
  ];
}
