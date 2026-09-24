{
  description = "GridDay — kwantowanie doby na 15-minutowe tokeny";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in
    {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 pkgs.gnumake ];
          shellHook = ''
            echo "GridDay · node $(node --version) · npm $(npm --version)"
            echo "make help — lista celów"
          '';
        };
      });
    };
}
